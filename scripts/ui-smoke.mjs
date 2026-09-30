// Headless smoke test for the inspection UI: serves the built site,
// drops a real JSON card through the page's drop handler, and asserts
// the rendered preview and lint report. Uses the locally installed Edge.
//
// Usage: npm run build && node scripts/ui-smoke.mjs

import assert from "node:assert/strict";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import puppeteer from "puppeteer-core";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const MIME = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" };

const server = createServer(async (req, res) => {
  const url = (req.url ?? "/").replace(/^\/card-lint/, "");
  const path = url === "/" || url === "" ? "/index.html" : url;
  try {
    const body = await readFile(join(DIST, path));
    res.writeHead(200, { "content-type": MIME[path.slice(path.lastIndexOf("."))] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});

await new Promise((resolve) => server.listen(8125, "127.0.0.1", resolve));

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ["--no-sandbox", `--user-data-dir=${join(await mkdtemp(join(tmpdir(), "card-lint-")), "profile")}`],
});

try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:8125/card-lint/");
  assert.equal(await page.title(), "card-lint — 角色卡体检");

  await page.evaluate(() => {
    const card = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "{{char}}",
        description: "",
        personality: "calm",
        scenario: "desktop",
        first_mes: "",
        mes_example: "hi",
        alternate_greetings: ["ok", " "],
        character_book: {
          entries: [
            { keys: [], content: "x" },
            { keys: ["a"], content: "y" },
            { keys: ["a"], content: "z" },
          ],
        },
        extensions: {},
        creator: "",
        tags: [],
      },
    };
    const file = new File([JSON.stringify(card)], "test-card.json", { type: "application/json" });
    const dt = new DataTransfer();
    dt.items.add(file);
    document.getElementById("drop").dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
  });

  await new Promise((resolve) => setTimeout(resolve, 300));
  const result = await page.evaluate(() => ({
    reportHidden: document.getElementById("report").hidden,
    preview: document.getElementById("preview").innerText,
    issues: [...document.querySelectorAll("#issues .issue")].map((e) => `${e.className}|${e.innerText}`),
    exportPngDisabled: document.getElementById("export-png").disabled,
  }));

  assert.equal(result.reportHidden, false, "report panel should be visible");
  assert.match(result.preview, /name|{{char}}/);
  const rules = result.issues.join("\n");
  for (const rule of ["macro-in-name", "missing-field", "book-empty-key", "book-key-collision", "empty-greeting"]) {
    assert.match(rules, new RegExp(rule), `expected rule ${rule}`);
  }
  assert.equal(result.exportPngDisabled, true, "PNG export stays disabled for JSON input");
  console.log("UI smoke passed:", JSON.stringify(result.issues, null, 2));
} finally {
  await browser.close();
  server.close();
}
