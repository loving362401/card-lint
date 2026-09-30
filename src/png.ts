// PNG chunk parsing plus character-card tEXt extraction, in the style
// SillyTavern writes cards: base64 JSON in a tEXt chunk under the
// `chara` (V2) or `ccv3` (V3) keyword.

import {
  decodeBase64Utf8,
  decodeTextChunk,
  encodeBase64Utf8,
  encodeTextChunk,
  latin1Bytes,
  latin1String,
} from "./codec";

export interface PngChunk {
  type: string;
  data: Uint8Array;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

export const crc32 = (buf: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

export const isPng = (buf: Uint8Array): boolean =>
  buf.length >= 8 && PNG_SIGNATURE.every((b, i) => buf[i] === b);

export const parsePngChunks = (buf: Uint8Array): PngChunk[] => {
  if (!isPng(buf)) throw new Error("not a PNG file");
  const chunks: PngChunk[] = [];
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let offset = 8;
  while (offset + 12 <= buf.length) {
    const length = view.getUint32(offset);
    const end = offset + 8 + length;
    if (end + 4 > buf.length) throw new Error("truncated PNG chunk");
    const type = latin1String(buf.subarray(offset + 4, offset + 8));
    const data = buf.subarray(offset + 8, end);
    const crc = view.getUint32(end);
    if (crc32(buf.subarray(offset + 4, end)) !== crc) {
      throw new Error(`PNG chunk ${type} has a bad CRC`);
    }
    chunks.push({ type, data: new Uint8Array(data) });
    offset = end + 4;
    if (type === "IEND") break;
  }
  return chunks;
};

export const buildPng = (chunks: PngChunk[]): Uint8Array => {
  let total = 8;
  for (const c of chunks) total += 12 + c.data.length;
  const out = new Uint8Array(total);
  out.set(PNG_SIGNATURE, 0);
  const view = new DataView(out.buffer);
  let offset = 8;
  for (const c of chunks) {
    const typeBytes = latin1Bytes(c.type);
    view.setUint32(offset, c.data.length);
    out.set(typeBytes, offset + 4);
    out.set(c.data, offset + 8);
    view.setUint32(offset + 8 + c.data.length, crc32(out.subarray(offset + 4, offset + 8 + c.data.length)));
    offset += 12 + c.data.length;
  }
  return out;
};

export const CARD_CHUNK_KEYWORDS = ["chara", "ccv3"] as const;
export type CardChunkKeyword = (typeof CARD_CHUNK_KEYWORDS)[number];

export interface CardChunk {
  keyword: CardChunkKeyword;
  json?: unknown;
  error?: string;
}

export interface CardExtraction {
  chunks: CardChunk[];
  pngError?: string;
}

const isCardKeyword = (keyword: string): keyword is CardChunkKeyword =>
  (CARD_CHUNK_KEYWORDS as readonly string[]).includes(keyword);

export const extractCardChunks = (buf: Uint8Array): CardExtraction => {
  let chunks: PngChunk[];
  try {
    chunks = parsePngChunks(buf);
  } catch (e) {
    return { chunks: [], pngError: (e as Error).message };
  }
  const out: CardChunk[] = [];
  for (const chunk of chunks) {
    if (chunk.type !== "tEXt") continue;
    let keyword: string;
    let text: string;
    try {
      ({ keyword, text } = decodeTextChunk(chunk.data));
    } catch {
      continue;
    }
    if (!isCardKeyword(keyword)) continue;
    try {
      out.push({ keyword, json: JSON.parse(decodeBase64Utf8(text)) });
    } catch (e) {
      out.push({ keyword, error: `card payload is not readable base64 JSON: ${(e as Error).message}` });
    }
  }
  return { chunks: out };
};

// Replace (or insert) one card keyword, preserving every other chunk.
export const upsertCardChunk = (
  buf: Uint8Array,
  keyword: CardChunkKeyword,
  json: unknown,
): Uint8Array => {
  const kept = parsePngChunks(buf).filter((chunk) => {
    if (chunk.type !== "tEXt") return true;
    try {
      return decodeTextChunk(chunk.data).keyword !== keyword;
    } catch {
      return true;
    }
  });
  const card: PngChunk = {
    type: "tEXt",
    data: encodeTextChunk({ keyword, text: encodeBase64Utf8(JSON.stringify(json)) }),
  };
  // PNG requires tEXt before IDAT, so insert ahead of the image data.
  const idatAt = kept.findIndex((chunk) => chunk.type === "IDAT");
  const at = idatAt < 0 ? kept.length : idatAt;
  return buildPng([...kept.slice(0, at), card, ...kept.slice(at)]);
};
