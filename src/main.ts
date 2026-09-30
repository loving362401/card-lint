// Inspection UI: drop a card, see a preview and the lint report, export.

import { parseCard, type ParsedCard } from "./card";
import { lint, type LintIssue } from "./lint";
import {
  extractCardChunks,
  isPng,
  upsertCardChunk,
  type CardChunkKeyword,
} from "./png";

const drop = document.getElementById("drop") as HTMLElement;
const fileInput = document.getElementById("file") as HTMLInputElement;
const report = document.getElementById("report") as HTMLElement;
const previewEl = document.getElementById("preview") as HTMLElement;
const issuesEl = document.getElementById("issues") as HTMLElement;
const exportJsonBtn = document.getElementById("export-json") as HTMLButtonElement;
const exportPngBtn = document.getElementById("export-png") as HTMLButtonElement;

interface Loaded {
  fileName: string;
  card?: ParsedCard;
  payload?: unknown;
  png?: Uint8Array;
  issues: LintIssue[];
}

let loaded: Loaded | null = null;

const chunkKeyword = (spec: ParsedCard["spec"]): CardChunkKeyword =>
  spec === "chara_card_v3" ? "ccv3" : "chara";

const previewCard = (state: Loaded) => {
  const parts: string[] = [];
  const d = state.card?.data;
  if (state.png) {
    const url = URL.createObjectURL(new Blob([state.png as BlobPart], { type: "image/png" }));
    parts.push(`<img src="${url}" alt="card artwork" />`);
  }
  if (d) {
    parts.push(`<div class="name">${escapeHtml(d.name || "(no name)")}</div>`);
    parts.push(
      `<div class="meta">${state.card?.spec ?? ""} · ${escapeHtml(d.creator || "unknown creator")} · ${d.tags.map(escapeHtml).join(", ") || "no tags"}</div>`,
    );
    if (d.first_mes) {
      parts.push(`<div class="first-mes">${escapeHtml(d.first_mes.slice(0, 400))}</div>`);
    }
  } else {
    parts.push(`<div class="name">${escapeHtml(state.fileName)}</div>`);
    parts.push(`<div class="meta">card payload could not be read</div>`);
  }
  previewEl.innerHTML = parts.join("");
};

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

const renderIssues = (issues: LintIssue[]) => {
  if (issues.length === 0) {
    issuesEl.innerHTML = `<div class="issue info"><span class="rule">clean</span><span>没有发现问题</span></div>`;
    return;
  }
  issuesEl.innerHTML = issues
    .map(
      (i) =>
        `<div class="issue ${i.severity}"><span class="rule">${escapeHtml(i.rule)}</span><span>${escapeHtml(i.message)}</span></div>`,
    )
    .join("");
};

const download = (name: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

const loadFile = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const state: Loaded = { fileName: file.name, issues: [] };

  if (isPng(bytes)) {
    state.png = bytes;
    const extraction = extractCardChunks(bytes);
    const preferred =
      extraction.chunks.find((c) => c.keyword === "ccv3" && c.json !== undefined) ??
      extraction.chunks.find((c) => c.json !== undefined);
    if (preferred) {
      state.card = parseCard(preferred.json);
      state.payload = preferred.json;
    }
    state.issues = lint({ card: state.card, extraction });
  } else {
    try {
      state.payload = JSON.parse(new TextDecoder().decode(bytes));
      state.card = parseCard(state.payload);
      state.issues = lint({ card: state.card });
    } catch (e) {
      state.issues = [
        { rule: "json-unreadable", severity: "error", message: (e as Error).message },
      ];
    }
  }

  loaded = state;
  previewCard(state);
  renderIssues(state.issues);
  exportPngBtn.disabled = !state.png;
  report.hidden = false;
};

drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  const file = e.dataTransfer?.files?.[0];
  if (file) void loadFile(file);
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void loadFile(file);
});

exportJsonBtn.addEventListener("click", () => {
  if (!loaded?.payload) return;
  const name = loaded.card?.data.name || "card";
  download(`${name}.json`, new Blob([JSON.stringify(loaded.payload, null, 2)], { type: "application/json" }));
});

exportPngBtn.addEventListener("click", () => {
  if (!loaded?.png || !loaded?.card || loaded.payload === undefined) return;
  const png = upsertCardChunk(loaded.png, chunkKeyword(loaded.card.spec), loaded.payload);
  const name = loaded.card.data.name || "card";
  download(`${name}.png`, new Blob([png as BlobPart], { type: "image/png" }));
});
