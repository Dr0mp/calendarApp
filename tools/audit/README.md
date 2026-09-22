# Audit tools

Run them from the project root, with `cd tools/audit && npm install` done once.

| Command | What it reports |
|---|---|
| `npm run metrics` (`node tools/audit/metrics.mjs`) | One-screen summary: duplicate selectors, `!important`, raw colours, inline styles, dead code, i18n gaps |
| `node tools/audit/css-report.js .` | Full CSS report, written to `tools/audit/css-report.txt` |
| `node tools/audit/html-js-report.js .` | Classes/ids used vs defined, orphan element refs, inline styles, written to `hj-report.txt` |
| `node tools/audit/methods-report.js .` | App methods, unreferenced methods, largest methods |
| `node tools/audit/i18n.mjs .` | Unused, missing and duplicate translation keys |
| `node tools/audit/dead-css.js .` | Fully dead CSS rules |
| `node tools/audit/css-diff.mjs <git-ref>` | **Regression check**: compares `getComputedStyle()` of every element in 14 app states × dark/light × desktop/mobile between a git ref and the working copy. Needs the test server running on :3100 (`node tests/start-test-server.mjs`). Takes about 7 minutes. |

Safe, scripted clean-ups (verify each with `css-diff.mjs` afterwards):

| Command | What it does |
|---|---|
| `node tools/audit/remove-dead-css.js` | Removes rules or selectors whose classes appear nowhere in the app |
| `node tools/audit/remove-unused-i18n.mjs` | Removes translation keys that nothing references |
| `node tools/audit/drop-overridden.js` | Removes declarations that can never win (the same selector is declared again later) |
| `node tools/audit/collapse-duplicates.js` | Merges repeated selector blocks when it can do so without changing the cascade |
| `node tools/audit/tokenize-colors.js` | Replaces raw palette colours with `rgb(var(--token))` |
| `node tools/audit/snap-scale.js` | Snaps font sizes, radii, weights and durations to the token scale. **This changes visuals.** |
| `node tools/audit/relax-important.js --dry` | Lists which `!important` declarations are still needed and why |
