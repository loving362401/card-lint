// Lint rules for character cards. Each rule is independent and reports
// issues by severity; lint() runs them all and sorts errors first.

import type { CardData, ParsedCard } from "./card";
import type { CardExtraction } from "./png";

export type Severity = "error" | "warning" | "info";

export interface LintIssue {
  rule: string;
  severity: Severity;
  message: string;
  field?: string;
}

export interface LintInput {
  card?: ParsedCard;
  extraction?: CardExtraction;
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

const issue =
  (rule: string, severity: Severity, message: string, field?: string): LintIssue =>
  field ? { rule, severity, message, field } : { rule, severity, message };

// --- PNG payload rules ---

const lintExtraction = (extraction: CardExtraction): LintIssue[] => {
  const out: LintIssue[] = [];
  if (extraction.pngError) {
    out.push(issue("png-unreadable", "error", `PNG cannot be read: ${extraction.pngError}`));
    return out;
  }
  if (extraction.chunks.length === 0) {
    out.push(issue("no-card-chunk", "error", "PNG carries no chara/ccv3 card payload"));
    return out;
  }
  for (const chunk of extraction.chunks) {
    if (chunk.error) {
      out.push(issue("chunk-unreadable", "error", `${chunk.keyword} chunk: ${chunk.error}`));
    }
  }
  const parsed = extraction.chunks.filter((c) => c.json !== undefined);
  const v2 = parsed.find((c) => c.keyword === "chara");
  const v3 = parsed.find((c) => c.keyword === "ccv3");
  if (v2 && v3 && JSON.stringify(v2.json) !== JSON.stringify(v3.json)) {
    out.push(
      issue(
        "chunk-conflict",
        "warning",
        "chara and ccv3 chunks disagree; readers that prefer one will drop the other's fields",
      ),
    );
  }
  return out;
};

// --- Card data rules ---

const lintCard = (card: ParsedCard): LintIssue[] => {
  const out: LintIssue[] = [];
  const d: CardData = card.data;

  for (const field of ["name", "description", "first_mes"] as const) {
    if (!d[field].trim()) {
      out.push(issue("missing-field", "error", `${field} is empty`, field));
    }
  }

  if (d.name.includes("{{")) {
    out.push(issue("macro-in-name", "error", "name still contains a {{macro}} placeholder", "name"));
  }

  if (d.mes_example.trim() && !d.mes_example.includes("<START>")) {
    out.push(
      issue(
        "example-format",
        "warning",
        "mes_example has no <START> separator; example dialogue blocks may merge",
        "mes_example",
      ),
    );
  }

  const book = d.character_book;
  if (book) {
    const empty = book.entries.filter((e) => e.keys.length === 0).length;
    if (empty > 0) {
      out.push(
        issue(
          "book-empty-key",
          "warning",
          `${empty} world-book ${empty === 1 ? "entry has" : "entries have"} no keys and will never trigger`,
          "character_book",
        ),
      );
    }
    const seen = new Map<string, number>();
    for (const e of book.entries) {
      for (const key of e.keys) seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const collisions = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    if (collisions.length > 0) {
      out.push(
        issue(
          "book-key-collision",
          "info",
          `keys shared by several entries: ${collisions.slice(0, 5).join(", ")}`,
          "character_book",
        ),
      );
    }
  }

  const blankGreetings = d.alternate_greetings.filter((g) => !g.trim()).length;
  if (blankGreetings > 0) {
    out.push(
      issue(
        "empty-greeting",
        "warning",
        `${blankGreetings} alternate_greetings ${blankGreetings === 1 ? "is" : "are"} blank`,
        "alternate_greetings",
      ),
    );
  }

  if (d.extensions !== null && typeof d.extensions !== "object") {
    out.push(
      issue("extensions-shape", "warning", "extensions is not an object and will be dropped", "extensions"),
    );
  }

  if (card.spec === "chara_card_v3") {
    const assets = Array.isArray(d.assets) ? (d.assets as unknown[]) : [];
    const badUri = assets.filter((a) => {
      const uri = typeof a === "object" && a !== null ? (a as Record<string, unknown>).uri : undefined;
      return typeof uri !== "string" || !/^(embeded|https|data):/.test(uri);
    }).length;
    if (badUri > 0) {
      out.push(
        issue("v3-asset-uri", "warning", `${badUri} V3 assets use an unsupported uri scheme`, "assets"),
      );
    }
  }

  const budget =
    d.description.length +
    d.personality.length +
    d.scenario.length +
    d.first_mes.length +
    d.system_prompt.length;
  if (budget > 4000) {
    out.push(
      issue(
        "prompt-budget",
        "info",
        `core prompt fields total ${budget} characters (~${Math.round(budget / 4)} tokens); large for small context windows`,
      ),
    );
  }

  if (!d.tags.length && !d.creator.trim()) {
    out.push(issue("discoverability", "info", "card has neither tags nor a creator name"));
  }

  return out;
};

export const lint = (input: LintInput): LintIssue[] => {
  const out: LintIssue[] = [];
  if (input.extraction) out.push(...lintExtraction(input.extraction));
  if (input.card) out.push(...lintCard(input.card));
  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
};
