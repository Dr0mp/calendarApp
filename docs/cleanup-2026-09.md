# Clean-up report: Calendar (September 2026)

This report covers the fixes from three audits: the security audit (`calendar-audit.md`), the dead-code audit and the design-cohesion audit. The work followed `calendar-fix-plan.md`, with one git commit per step. You can review each commit on its own and revert it independently.

**How it was verified:** 62 automated tests run after every step:
- smoke tests of the main flows;
- security tests for the server;
- regression tests, one per bug fixed;
- 34 screenshots covering dark and light themes, Romanian and English, desktop and mobile.

CSS refactors were also checked with `tools/audit/css-diff.mjs`. It compares the computed style of every element in 14 app states (including open dialogs), in three theme/width combinations, against the previous commit. Steps that weren't meant to change anything visually came back with **0 differences**.

---

## Before and after

| Metric | Before | After |
|---|---|---|
| Largest JS file | `app.js`, 7,239 lines | `events/event-form.js`, 863 lines (22 modules) |
| `applyLanguage()` | 427 lines | ~90 lines (labels declared in markup) |
| Duplicate CSS selectors / overridden properties | 90 / 237 | 41 / 5 (the remaining duplicates are intentional grouped selectors) |
| Raw colours in CSS rules (unique) | 240 | 92 one-off shades; 451 usages now go through 56 palette tokens |
| Font-size values / radius values | 51 / 17 | 15 / 9 (all on the token scale) |
| `!important` (excluding utilities and `[hidden]`) | 69 | 66, all of them load-bearing against JS inline styles (see Follow-ups) |
| Inline `style=""` in HTML / in JS templates | 199 / 93 | 38 / 12 (only JS-driven `display` toggles and data-driven colours) |
| Dead CSS rules / unused CSS classes | 56 / 58 | 0 / 0 |
| Unused / missing / duplicate i18n keys | 255 / 5 / 4 | 0 / 0 / 0 |
| Orphan element references / unreferenced methods | 8 (+7 never cached) / 2 | 0 / 0 |
| Native `alert` / `confirm` / `prompt` | 74 / 14 / 2 | 0 (in-app toasts and dialogs) |
| Automated tests | none | 62 |

---

## Security (P1)

- **Only `public/` is served.** `server.js`, `users.json`, `package.json`, `node_modules`, `.env` and `.git` all return 404.
- **`JWT_SECRET` is now required** (at least 32 characters). The old hardcoded secret is gone and now useless: tokens signed with it no longer verify.
- **No passwords in the source code.** On a first run, the admin account is created from `ADMIN_INITIAL_PASSWORD`. At startup, the server warns if a real account still uses a password that was published in the source.
- **Fixed: user accounts deleted themselves.** New and renamed accounts used to disappear on the very next request.
- **Users are kept in memory and written atomically**, instead of a blocking read on every request.
- **CORS** is allowed only for origins listed in `ALLOWED_ORIGINS`. By default the app is same-origin only.
- **Password policy:** at least 10 characters, and different from the username.
- **Token revocation:** logging out or changing the password invalidates every copy of that user's session cookie. Sessions last 12 hours.
- **CSP is back on.** Scripts are self-only. Inline `onerror` handlers were replaced so they don't break under it.
- **New endpoint `/api/users/directory`**, so regular users get names and colours without the admin-only user list.

## Bugs fixed (P2 and found along the way)

- Raw translation keys showed in the UI: "cancel", "event_type_event", "event_image_required".
- "Today" was hardcoded to 15 September 2026.
- The removed "show only what we have" filter could still hide days, and there was no control left to undo it.
- A stale session saved in the browser decided the first view the user saw.
- Notification card state classes didn't match the CSS.
- Clicking a free-hour slot or a "Reschedule" suggestion crashed with a JavaScript error.
- My Events filter reset pointed to a non-existent element.
- The Edit User dialog was never translated.
- Moderators saw the Social and Admin tabs, which are admin-only.
- In English mode, dates were formatted in Romanian.
- Month calendar columns had uneven widths.
- On My Events cards, the delete button overflowed the card.
- About 200 strings stayed in English for Romanian users (and vice versa). They're now translated in both languages.

## Structure and cleanup (P3–P7)

- **Removed:**
  - the portal leftovers and the `isSocialUnlocked` flag;
  - the copy of the user list kept in the browser;
  - 11 references to elements that no longer exist;
  - two login paths (one login screen remains);
  - 263 + 11 unused translation keys;
  - about 390 lines of dead CSS.
- **Split `app.js` into ES-module mixins** under `public/src/` (core, auth, social, events, admin).
- **One event data model** (`startDate`, `endDate`, `hour`). Events saved by older builds are migrated automatically when loaded.
- **Shared helpers** replaced copy-pasted code: the event record builder, the tag renderer, the room validator, the API helper and the role-based navigation.
- **Translations are declared in the markup** with `data-i18n` attributes, and the static text in `index.html` is in Romanian.

## Design system (P8–P9)

- **One colour palette.** The competing second `:root` block was merged. Colours are now defined in two layers: palette primitives (`--violet-500: 139 92 246`) and semantic tokens (`--text-muted`, `--status-success`).
- **Type, radius and motion use the scale:** `--text-3xs` … `--text-display`, `--radius-*` and `--duration-*`.
- **Two breakpoints:** 900px and 640px.
- **Inline styles became utility classes:** 174 `u-*` classes, listed at the end of `styles.css`.
- **One icon set:** Heroicons solid. Emoji are no longer used as icons, and the close buttons use a proper icon.
- **One naming convention for states:** `is-*` (`.active` became `.is-active`, and so on).
- **In-app feedback:** toasts, plus confirm and prompt dialogs, replace the browser's native ones.

---

## Passkeys (added after the clean-up)

- **Passkey sign-in (WebAuthn)** uses `@passwordless-id/webauthn`. Passwords remain as the fallback.
- **Endpoints:** `/api/passkeys/*`. Challenges are single-use and expire after 5 minutes. The server checks the origin against `APP_ORIGINS` and requires user verification. Signature counters are tracked.
- **Users** manage their own passkeys from the key icon in the top bar. **Admins** can remove all of a user's passkeys when a device is lost. Demo accounts can't add passkeys.
- **Tests:** four new tests use Chromium's virtual authenticator. They cover the full cycle (register, sign in, remove), the admin reset, the demo block, and rejection of forged or replayed requests. The suite now has 66 tests.

## Data on the server (added after the clean-up)

- **Posts, events, platforms, spaces and rooms moved out of `localStorage`** into `data/workspace.json` on the server. Uploaded images and videos are saved as files in `data/uploads/`. Every browser now sees the same data, and the old `localStorage` copies are removed automatically on the first load.
- **A new install starts with a copy of the sample content.**
- **Demo accounts can now edit freely,** but only on their own copy (`data/demo.json`). It's reset on every start and every night. They only see the demo accounts in the user lists.
- **The server checks every change:** who owns an event, who may book rooms, and which content is admin-only. It also rejects inline base64 media and uploads whose content doesn't match an allowed type.
- **Storage:** Admin → Storage shows the real usage of events and posts, media included, against `STORAGE_CAP_GB` (default 8 GB). The cap is enforced on uploads and saves.
- **Fixed along the way:**
  - the admin events table headers each carried two translation keys;
  - the new-user password hint said 4 characters, but the minimum is 10;
  - the storage texts had "8 GB" hardcoded.
- **Tests:** 6 new tests cover data shared across browsers, permissions, demo isolation, uploads and the storage panel. The suite now has 73 tests.

## Decisions I made for you (from the plan's defaults)

| # | Decision |
|---|---|
| D1 | Kept the full-screen login and removed the login pop-up. |
| D2 | The storage-quota simulator only appears with `?dev=1` in the URL. |
| D3 | **Done later:** demo accounts get their own sample workspace; new installs start from a copy of it. |
| D4 | Done: in-app toasts and dialogs. |
| D5 | The admin password comes from `ADMIN_INITIAL_PASSWORD`. Demo accounts keep `DEMO_PASSWORD` (default `demo123`) because the login screen's demo buttons use it. They can't touch user accounts, and their data is a sample copy that resets. |
| D6 | `is-*` for states. |

## Follow-ups (not done, on purpose)

1. **Change the admin password in your existing `users.json`.** It's still `admin123`, and the server warns about this at startup.
2. ~~Calendar data is stored per browser.~~ **Done:** see "Data on the server" above.
3. **Visibility still uses JS `style.display`.** There are 120 toggles. Moving them to the `hidden` attribute needs a per-element check. Until then, CSP keeps `style-src 'unsafe-inline'`; `script-src` is strict.
4. **66 `!important` remain.** They beat inline colours set from JS (per-user accent colours on event pills and nav tabs). They can go once those move to CSS custom properties.
5. **Component consolidation isn't done yet.** There are still 7 segmented/tab variants and 22 badge classes. Merging them into `.segmented`, `.badge` and `.chip` is a design task: it changes appearance, so review it with the designer.
6. **The light theme is still a patch layer** of about 100 rules. It shrinks as items 4 and 5 land.
7. **92 one-off colour shades** remain, mostly in the light theme. They should be named by the designer or snapped to the palette.

## Running it

```
npm install
copy .env.example .env      (set JWT_SECRET; ADMIN_INITIAL_PASSWORD only if users.json has no admin)
npm start                   (or run_server.bat)
```

Tests: `npx playwright install chromium` once, then run `npm test`. Metrics: run `npm run audit:setup` once, then `npm run metrics`.
