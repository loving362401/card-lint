// Character card payload model. Handles V1 (flat), V2 (chara_card_v2)
// and V3 (chara_card_v3) shapes.

export type CardSpec = "chara_card_v1" | "chara_card_v2" | "chara_card_v3" | "unknown";

export interface BookEntry {
  keys: string[];
  content: string;
  [k: string]: unknown;
}

export interface CharacterBook {
  entries: BookEntry[];
  [k: string]: unknown;
}

export interface CardData {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  alternate_greetings: string[];
  tags: string[];
  creator: string;
  character_version: string;
  extensions: Record<string, unknown> | null;
  character_book: CharacterBook | null;
  [k: string]: unknown;
}

export interface ParsedCard {
  spec: CardSpec;
  specVersion: string | null;
  data: CardData;
  raw: unknown;
}

const STRING_FIELDS = [
  "name",
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
  "creator_notes",
  "system_prompt",
  "post_history_instructions",
  "creator",
  "character_version",
] as const;

const asString = (v: unknown): string => (typeof v === "string" ? v : "");

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

const asBook = (v: unknown): CharacterBook | null => {
  if (typeof v !== "object" || v === null) return null;
  const book = v as Record<string, unknown>;
  const entries = Array.isArray(book.entries) ? book.entries : [];
  return {
    ...book,
    entries: entries.map((e) => {
      const entry = (typeof e === "object" && e !== null ? e : {}) as Record<string, unknown>;
      return {
        ...entry,
        keys: asStringArray(entry.keys),
        content: asString(entry.content),
      };
    }),
  };
};

export const detectSpec = (obj: Record<string, unknown>): CardSpec => {
  switch (obj.spec) {
    case "chara_card_v2":
    case "chara_card_v3":
      return obj.spec;
    case undefined:
      return "chara_card_v1";
    default:
      return "unknown";
  }
};

export const parseCard = (raw: unknown): ParsedCard => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("card payload is not a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  const spec = detectSpec(obj);
  const source =
    typeof obj.data === "object" && obj.data !== null
      ? (obj.data as Record<string, unknown>)
      : obj;

  const data = { ...source } as CardData;
  for (const field of STRING_FIELDS) data[field] = asString(source[field]);
  data.alternate_greetings = asStringArray(source.alternate_greetings);
  data.tags = asStringArray(source.tags);
  data.character_book = asBook(source.character_book);
  data.extensions =
    typeof source.extensions === "object" && source.extensions !== null && !Array.isArray(source.extensions)
      ? (source.extensions as Record<string, unknown>)
      : source.extensions === undefined
        ? null
        : (source.extensions as unknown as Record<string, unknown>);

  return {
    spec,
    specVersion: typeof obj.spec_version === "string" ? obj.spec_version : null,
    data,
    raw,
  };
};
