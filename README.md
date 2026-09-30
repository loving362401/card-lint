# card-lint

角色卡体检检视器 — inspect and health-check SillyTavern-style character cards, entirely in your browser.

把 PNG/JSON 角色卡拖进来，立刻看懂它、体检查错、干净导出。所有解析都在浏览器本地完成，卡片不会上传到任何服务器。

## What it does (开发中)

- **Reads** character cards from `.png` (base64 JSON in `tEXt` chunks, keywords `chara` / `ccv3`) and `.json` — V1 / V2 / V3 card specs
- **Health-checks** them with severity-ranked rules: missing core fields, `{{macro}}` placeholders left in names, `<START>` formatting, world-book entries that can never trigger, key collisions, conflicting V2/V3 payloads, blank greetings, prompt budget, and more
- **Exports** clean JSON or PNG without dropping `extensions` passthrough data

## Development

```sh
npm install
npm test        # vitest
npm run dev     # vite dev server
```

## Status

Core parser and lint rules are covered by tests. The inspection UI is next.

---

License: MIT
