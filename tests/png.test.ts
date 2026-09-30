import assert from "node:assert/strict";
import { test } from "vitest";
import {
  decodeBase64Utf8,
  decodeTextChunk,
  encodeBase64Utf8,
  encodeTextChunk,
} from "../src/codec";
import {
  buildPng,
  extractCardChunks,
  parsePngChunks,
  upsertCardChunk,
  crc32,
} from "../src/png";
import { cleanCard, pngWithCard, tinyPng } from "./helpers";

test("tinyPng round-trips through parsePngChunks", () => {
  const chunks = parsePngChunks(tinyPng());
  assert.deepEqual(
    chunks.map((c) => c.type),
    ["IHDR", "IDAT", "IEND"],
  );
});

test("parsePngChunks rejects non-PNG input", () => {
  assert.throws(() => parsePngChunks(new Uint8Array([1, 2, 3])), /not a PNG/);
});

test("parsePngChunks rejects a chunk with a bad CRC", () => {
  const png = tinyPng();
  png[20] ^= 0xff; // flip a byte inside IHDR data
  assert.throws(() => parsePngChunks(png), /bad CRC/);
});

test("buildPng writes CRCs that crc32 confirms", () => {
  const data = new Uint8Array([1, 2, 3]);
  const png = buildPng([{ type: "tEXt", data }]);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const end = 8 + 8 + data.length;
  assert.equal(view.getUint32(end), crc32(png.subarray(12, end)));
});

test("base64 UTF-8 survives a Chinese round trip", () => {
  const s = "虚拟桌宠 · {{char}}";
  assert.equal(decodeBase64Utf8(encodeBase64Utf8(s)), s);
});

test("tEXt chunk codec round-trips keyword and text", () => {
  const chunk = { keyword: "chara", text: "eyJuYW1lIjogIk1penUifQ==" };
  assert.deepEqual(decodeTextChunk(encodeTextChunk(chunk)), chunk);
});

test("extractCardChunks reads chara and ccv3 payloads", () => {
  const v2 = cleanCard();
  const v3 = { spec: "chara_card_v3", spec_version: "3.0", data: { name: "Mizu" } };
  let png = pngWithCard("chara", v2);
  png = upsertCardChunk(png, "ccv3", v3);
  const { chunks } = extractCardChunks(png);
  assert.equal(chunks.length, 2);
  assert.deepEqual(
    chunks.map((c) => c.keyword),
    ["chara", "ccv3"],
  );
  assert.deepEqual(chunks[0].json, v2);
  assert.deepEqual(chunks[1].json, v3);
});

test("extractCardChunks reports unreadable payloads instead of throwing", () => {
  const chunks = parsePngChunks(tinyPng());
  const idatAt = chunks.findIndex((c) => c.type === "IDAT");
  const png = buildPng([
    ...chunks.slice(0, idatAt),
    { type: "tEXt", data: encodeTextChunk({ keyword: "chara", text: "%%%%" }) },
    ...chunks.slice(idatAt),
  ]);
  const cards = extractCardChunks(png).chunks;
  assert.equal(cards.length, 1);
  assert.equal(cards[0].keyword, "chara");
  assert.match(cards[0].error ?? "", /not readable base64 JSON/);
});

test("upsertCardChunk replaces one keyword and preserves everything else", () => {
  const v2a = cleanCard();
  const v2b = cleanCard({ name: "Rin" });
  const v3 = { spec: "chara_card_v3", spec_version: "3.0", data: { name: "Mizu" } };
  let png = upsertCardChunk(tinyPng(), "chara", v2a);
  png = upsertCardChunk(png, "ccv3", v3);
  png = upsertCardChunk(png, "chara", v2b);
  const { chunks } = extractCardChunks(png);
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks.find((c) => c.keyword === "chara")?.json, v2b);
  assert.deepEqual(chunks.find((c) => c.keyword === "ccv3")?.json, v3);
});

test("card chunks land before IDAT as PNG requires", () => {
  const png = pngWithCard("chara", cleanCard());
  const order = parsePngChunks(png).map((c) => c.type);
  assert.ok(order.indexOf("tEXt") < order.indexOf("IDAT"));
});
