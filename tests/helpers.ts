// Deterministic in-memory PNG fixtures built from the library's own
// chunk writer, so tests need no committed binary files.

import { deflateSync } from "node:zlib";
import { buildPng, upsertCardChunk, type CardChunkKeyword } from "../src/png";

const rawPng = (): Uint8Array => {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, 1); // width
  view.setUint32(4, 1); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const idat = new Uint8Array(deflateSync(new Uint8Array([0, 0, 0, 0, 0]))); // filter + one pixel
  return buildPng([
    { type: "IHDR", data: ihdr },
    { type: "IDAT", data: idat },
    { type: "IEND", data: new Uint8Array(0) },
  ]);
};

export const tinyPng = rawPng;

export const pngWithCard = (keyword: CardChunkKeyword, json: unknown): Uint8Array =>
  upsertCardChunk(tinyPng(), keyword, json);

export const cleanCard = (overrides: Record<string, unknown> = {}): unknown => ({
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "Mizu",
    description: "A calm pixel-fish companion.",
    personality: "calm, curious",
    scenario: "user's desktop",
    first_mes: "{{char}} waves from the corner of the screen.",
    mes_example: "<START>\n{{user}}: hi\n{{char}}: hello",
    creator: "mizufish_",
    tags: ["companion"],
    alternate_greetings: ["{{char}} blinks slowly."],
    extensions: {},
    character_version: "1.0",
    ...overrides,
  },
});
