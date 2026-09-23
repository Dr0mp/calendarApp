# Social Calendar & Workspace Suite

Node/Express server (authentication + user management) and a vanilla-JS single-page app in `public/`.

## Setup

1. Install Node.js 20+.
2. `npm install`
3. Copy `.env.example` to `.env`, then set:
   - `JWT_SECRET`: at least 32 random characters. Generate one with
     `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
   - `ADMIN_INITIAL_PASSWORD`: at least 12 characters. It's only used the first time, when `users.json` has no `admin` account yet.
4. Start the server with `npm start` (or double-click `run_server.bat` on Windows). Then open http://localhost:3000.

> **Upgrading an existing install:** the old default admin password (`admin123`) was published in the source code. If your `users.json` still uses it, the server prints a `[SECURITY]` warning at startup. Log in and change the password (Admin → Users → Edit), or delete the `admin` entry from `users.json` and restart with `ADMIN_INITIAL_PASSWORD` set.

## Accounts

- `admin`: the full administrator. Its password is set through `ADMIN_INITIAL_PASSWORD`, as described above.
- `demo` / `demo_admin`: read-only preview accounts that appear on the login screen. The password is `DEMO_PASSWORD` (default `demo123`). Set `ENABLE_DEMO_ACCOUNTS=0` to disable them.

## Passkeys

Users can sign in with a passkey (Windows Hello, Touch ID, a phone or a security key) instead of a password. The password stays as the fallback.

- **Add one:** sign in with your password, click the key icon in the top bar, then **Add passkey**. You can remove passkeys from the same dialog.
- **Sign in:** click **Sign in with passkey** on the login screen. You don't need to type a username.
- **Lost device:** an admin opens Admin → Users → Edit and clicks **Remove all passkeys**. The user then signs in with their password and adds a new passkey.
- **Requirements:** the browser only allows passkeys over HTTPS, or on `localhost`. A passkey is tied to the domain it was created on: passkeys made on `localhost` won't work on your real domain, and vice versa. When you deploy, set `APP_ORIGINS` in `.env` to the exact address users open, for example `https://calendar.example.com`.
- **Library:** the passkey code uses [`@passwordless-id/webauthn`](https://webauthn.passwordless.id/), on the server and in the browser (served from `/vendor/webauthn.js`). Passkeys are stored in `users.json`. Only the public key is stored, never a secret.

## Where data lives

- **Users:** on the server, in `users.json`. Passwords are stored as bcrypt hashes. This file is git-ignored.
- **Posts, events, spaces and rooms:** in each browser's `localStorage`. They are **not** shared between devices or browsers. Moving them to the server would be a separate piece of work.

## Project layout

```
server.js              Express server: auth, users API, serves public/ only
public/index.html      markup (static labels carry data-i18n keys)
public/styles.css      tokens -> components -> utilities (u-*)
public/src/app.js      SocialCalendarApp: state + mixin registration
public/src/core/       storage, i18n, dom refs, event binding, router, utils, feedback (toasts/dialogs)
public/src/auth.js     session, login/logout, user list
public/src/social/     social calendar, post editor, control panel, promotion queue
public/src/events/     event model, calendar views, event form, wizard, My Events
public/src/admin/      admin panel, users, venues, storage quota
public/src/data/       translations (RO/EN) and seed data
tests/                 Playwright: smoke, security, regressions, visual (screenshots in tests/__screens__)
tools/audit/           code-health metrics and safe clean-up scripts (see its README)
docs/                  clean-up report
```

## Development

| Command | What it does |
|---|---|
| `npm test` | Playwright tests: smoke flows, security checks and visual regression (34 screenshots) |
| `npm run test:update-screens` | Re-record the screenshots after an intended visual change |
| `npm run lint` | Syntax check of every JS file |
| `npm run metrics` | Code-health metrics (duplicate CSS, unused code, inline styles…) |
| `npm run check` | All of the above |

**Screenshots are stored per operating system** (`tests/__screens__/<platform>/`) because fonts render differently on Windows, macOS and Linux. The first time you run the tests on a new OS, record its baselines with `npm run test:update-screens`, then run `npm test`.

The tests start their own server on port 3100 with a temporary users store, so they never touch `users.json`.
