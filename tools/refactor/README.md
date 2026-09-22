# One-off refactoring scripts

These scripts were used once during the 2026-09 clean-up. Each commit message says which one ran.
They're kept for reference and aren't part of the app or the test suite.

| Script | Used for |
|---|---|
| `split-app.cjs` | P5: splits the old single `app.js` into mixin modules, copying method bodies verbatim |
| `i18n-map.mjs`, `i18n-conflicts.cjs`, `i18n-annotate.mjs` | P7: finds which static elements `applyLanguage()` translated, annotates them with `data-i18n`, and verifies the mapping didn't change |
| `i18n-untranslated.mjs`, `i18n-new-keys.py`, `i18n-apply-new.py` | P7: finds markup that stayed the same in RO and EN, then adds keys for it |
| `js_i18n_lib.py` | P7b: helper for the hardcoded-string sweep (exact replacements plus new keys) |
| `inline-to-utilities.cjs` | P9.1: turns `style=""` into `u-*` utility classes |

The re-runnable audit tools live in `tools/audit/` (see its README).
