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
- `demo` / `demo_admin`: try-out accounts that appear on the login screen. The password is `DEMO_PASSWORD` (default `demo123`). They work on their **own copy of the sample content**, never on your real data, and can change it freely. That copy is reset to the sample content every time the server starts and every night at `DEMO_RESET_HOUR` (default 03:00). They can't change user accounts or passkeys, and they only see the demo accounts in the user lists. Set `ENABLE_DEMO_ACCOUNTS=0` to disable them.

## Passkeys

Users can sign in with a passkey (Windows Hello, Touch ID, a phone or a security key) instead of a password. The password stays as the fallback.

- **Add one:** sign in with your password, click the key icon in the top bar, then **Add passkey**. You can remove passkeys from the same dialog.
- **Sign in:** click **Sign in with passkey** on the login screen. You don't need to type a username.
- **Lost device:** an admin opens Admin → Users → Edit and clicks **Remove all passkeys**. The user then signs in with their password and adds a new passkey.
- **Requirements:** the browser only allows passkeys over HTTPS, or on `localhost`. A passkey is tied to the domain it was created on: passkeys made on `localhost` won't work on your real domain, and vice versa. When you deploy, set `APP_ORIGINS` in `.env` to the exact address users open, for example `https://calendar.example.com`.
- **Library:** the passkey code uses [`@passwordless-id/webauthn`](https://webauthn.passwordless.id/), on the server and in the browser (served from `/vendor/webauthn.js`). Passkeys are stored in `users.json`. Only the public key is stored, never a secret.

## Phones and tablets

The app is responsive; there is no separate mobile version.

- **Up to 900px wide** (phones and tablets): navigation moves to a bottom tab bar: Calendar, Schedule, My events, Social (admins) and More. **More** opens a sheet with language, theme, passkeys and sign-out. The admin cog stays in the top bar.
- **Up to 640px wide** (phones):
  - Month calendars show each item as a colour bar. Tap a day to open it: the events calendar opens that day's timeline, and the social calendar opens the feed at that date.
  - The day timeline shows one day, and the arrows move one day at a time.
  - Admin tables turn into cards, one card per row, with each value under its column name.
  - Dialogs fill the screen.
- Everything lives in the responsive section at the end of `public/styles.css`. `isPhoneLayout()` in `public/src/core/utils.js` is the matching JS check.

## Where data lives

Everything is on the server, so every browser and device sees the same data.

| What | Where |
|---|---|
| User accounts and passkeys | `users.json` (passwords as bcrypt hashes) |
| Posts, events, platforms, spaces, rooms | `data/workspace.json` |
| Uploaded images and videos | `data/uploads/` (the JSON stores only their URLs) |
| Demo accounts' data and uploads | `data/demo.json`, `data/demo-uploads/` (recreated on every start and every night) |
| Per-browser preferences: language, theme, last view | the browser's `localStorage` |

- **First start:** if `data/workspace.json` doesn't exist, it's created as a copy of the sample content. From then on it's your data. To start over, stop the server, delete `data/workspace.json` and `data/uploads/`, and start it again.
- **Backups:** copy `users.json` and the whole `data/` folder while the server is stopped (or at a quiet moment). Both are git-ignored.
- **Storage cap:** events and posts (their records plus the media files they use) count against `STORAGE_CAP_GB` (default 8). Admin → Storage shows the usage. When the cap is reached, uploads and new content are refused until you free space with the cleanup tools. The demo workspace has its own small cap (`DEMO_STORAGE_CAP_MB`, default 200) because the demo password is public.
- **Uploads:** JPG, PNG, WebP, GIF, MP4, MOV and WebM, recognised by their content, not their name. The size limit is `MAX_UPLOAD_MB` (default 100). Files that no record uses are deleted automatically: right away when a record stops using them, or after an hour when a form was cancelled.
- **Permissions (checked by the server):** admins can change everything. Other users can create events and change or delete only their own. Room bookings are for admins and moderators. Posts, platforms, spaces and rooms are admin-only.

## Project layout

```
server.js              Express server: auth, users API, workspace data API, serves public/ only
lib/data-store.js      workspace JSON store: sync with permission checks, uploads, storage usage
public/index.html      markup (static labels carry data-i18n keys)
public/styles.css      tokens -> components -> utilities (u-*)
public/src/app.js      SocialCalendarApp: state + mixin registration
public/src/core/       storage, i18n, dom refs, event binding, router, utils, feedback (toasts/dialogs)
public/src/auth.js     session, login/logout, user list
public/src/social/     social calendar, post editor, control panel, promotion queue
public/src/events/     event model, calendar views, event form, wizard, My Events
public/src/admin/      admin panel, users, venues, storage quota
public/src/data/       translations (RO/EN) and the sample content (seed for new installs and demo)
data/                  your data (created on first start, git-ignored)
tests/                 Playwright: smoke, security, regressions, visual (screenshots in tests/__screens__)
tools/audit/           code-health metrics and safe clean-up scripts (see its README)
docs/                  clean-up report
```

## Development

| Command | What it does |
|---|---|
| `npm test` | Playwright tests: smoke flows, security and data-permission checks, phone layout, and visual regression (37 screenshots, 9 of them on a phone) |
| `npm run test:update-screens` | Re-record the screenshots after an intended visual change |
| `npm run lint` | Syntax check of every JS file |
| `npm run metrics` | Code-health metrics (duplicate CSS, unused code, inline styles…) |
| `npm run check` | All of the above |

**Screenshots are stored per operating system** (`tests/__screens__/<platform>/`) because fonts render differently on Windows, macOS and Linux. The first time you run the tests on a new OS, record its baselines with `npm run test:update-screens`, then run `npm test`.

The tests start their own server on port 3100 with a temporary users store and data folder, so they never touch `users.json` or `data/`. Each test starts from the sample content.
