// Text codecs shared by PNG tEXt handling and card payloads.
// tEXt payloads are Latin-1; card JSON travels as base64 of UTF-8 bytes.

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

export const utf8Bytes = (s: string): Uint8Array => utf8Encoder.encode(s);

export const utf8String = (b: Uint8Array): string => utf8Decoder.decode(b);

export const latin1Bytes = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
};

export const latin1String = (b: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

export const encodeBase64Utf8 = (s: string): string => btoa(latin1String(utf8Bytes(s)));

export const decodeBase64Utf8 = (b64: string): string =>
  utf8String(Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0)));

export interface TextChunkData {
  keyword: string;
  text: string;
}

export const decodeTextChunk = (data: Uint8Array): TextChunkData => {
  const sep = data.indexOf(0);
  if (sep < 0) throw new Error("tEXt chunk is missing its null separator");
  return {
    keyword: latin1String(data.subarray(0, sep)),
    text: latin1String(data.subarray(sep + 1)),
  };
};

export const encodeTextChunk = (chunk: TextChunkData): Uint8Array => {
  const key = latin1Bytes(chunk.keyword);
  const text = latin1Bytes(chunk.text);
  const out = new Uint8Array(key.length + 1 + text.length);
  out.set(key, 0);
  out[key.length] = 0;
  out.set(text, key.length + 1);
  return out;
};
