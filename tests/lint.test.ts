import assert from "node:assert/strict";
import { test } from "vitest";
import { parseCard } from "../src/card";
import { lint, type LintIssue } from "../src/lint";
import { extractCardChunks, upsertCardChunk } from "../src/png";
import { cleanCard, pngWithCard, tinyPng } from "./helpers";

const rules = (issues: LintIssue[]) => issues.map((i) => i.rule);

test("a clean V2 card reports no errors or warnings", () => {
  const issues = lint({ card: parseCard(cleanCard()) });
  assert.deepEqual(issues.filter((i) => i.severity !== "info"), []);
});

test("missing core fields are errors", () => {
  const card = parseCard(cleanCard({ name: "", description: " ", first_mes: "" }));
  const issues = lint({ card });
  const missing = issues.filter((i) => i.rule === "missing-field");
  assert.equal(missing.length, 3);
  assert.ok(issues.every((i) => i.rule !== "missing-field" || i.severity === "error"));
});

test("a macro left in the name is an error", () => {
  const card = parseCard(cleanCard({ name: "{{char}}" }));
  assert.ok(rules(lint({ card })).includes("macro-in-name"));
});

test("mes_example without <START> warns", () => {
  const card = parseCard(cleanCard({ mes_example: "{{user}}: hi\n{{char}}: hello" }));
  const issues = lint({ card });
  assert.ok(rules(issues).includes("example-format"));
});

test("world book rules fire on empty keys and collisions", () => {
  const card = parseCard(
    cleanCard({
      character_book: {
        entries: [
          { keys: [], content: "never triggers" },
          { keys: ["mizu"], content: "a" },
          { keys: ["mizu", "fish"], content: "b" },
        ],
      },
    }),
  );
  const fired = rules(lint({ card }));
  assert.ok(fired.includes("book-empty-key"));
  assert.ok(fired.includes("book-key-collision"));
});

test("blank alternate greetings warn", () => {
  const card = parseCard(cleanCard({ alternate_greetings: ["ok", "  "] }));
  assert.ok(rules(lint({ card })).includes("empty-greeting"));
});

test("oversized prompt fields report a budget note", () => {
  const card = parseCard(cleanCard({ description: "x".repeat(5000) }));
  const issues = lint({ card });
  const budget = issues.find((i) => i.rule === "prompt-budget");
  assert.equal(budget?.severity, "info");
});

test("V3 assets with bad uri schemes warn", () => {
  const card = parseCard({
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: {
      name: "Mizu",
      description: "d",
      first_mes: "hi",
      assets: [{ type: "icon", uri: "ftp://nope" }],
    },
  });
  assert.ok(rules(lint({ card })).includes("v3-asset-uri"));
});

test("a PNG without a card payload is an error", () => {
  const issues = lint({
    extraction: extractCardChunks(pngWithCard("chara", cleanCard())),
  });
  assert.deepEqual(issues, []);
  const bare = lint({ extraction: extractCardChunks(cleanPngWithoutCard()) });
  assert.ok(rules(bare).includes("no-card-chunk"));
});

test("conflicting chara and ccv3 payloads warn", () => {
  const extraction = extractCardChunks(
    pngWithTwoCards(cleanCard(), cleanCard({ name: "Rin" })),
  );
  assert.ok(rules(lint({ extraction })).includes("chunk-conflict"));
});

// Local helpers keep the PNG plumbing out of the rule assertions.

const cleanPngWithoutCard = () => tinyPng();

const pngWithTwoCards = (a: unknown, b: unknown) => {
  let png = pngWithCard("chara", a);
  png = upsertCardChunk(png, "ccv3", b);
  return png;
};
