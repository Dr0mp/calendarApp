import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import { server as webauthn } from "@passwordless-id/webauthn";
import { DataStore, COLLECTIONS } from "./lib/data-store.js";
import * as SEED from "./public/src/data/seed-data.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =========================================================================
// 0. CONFIGURATION (environment, optionally loaded from .env)
// =========================================================================
loadDotEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const USERS_FILE = process.env.USERS_FILE || path.join(__dirname, "users.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const TOKEN_TTL_HOURS = Number(process.env.TOKEN_TTL_HOURS) || 12;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
const COOKIE_SECURE = process.env.COOKIE_SECURE === "1";
const ENABLE_DEMO_ACCOUNTS = process.env.ENABLE_DEMO_ACCOUNTS !== "0";
// Demo accounts work on their own sample workspace (reset daily) and cannot change users/passkeys
// (see blockDemoWrites). Their password is shown on the login screen.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "demo123";
const MIN_PASSWORD_LENGTH = 10;
// Workspace data (posts, events, venues...) and uploaded media live here.
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
// Storage cap for events + posts (records and their media). The admin panel shows usage against it.
const STORAGE_CAP_BYTES = Math.round((Number(process.env.STORAGE_CAP_GB) || 8) * 1024 ** 3);
// The demo login is public, so its uploads get a small cap of their own.
const DEMO_STORAGE_CAP_BYTES = Math.round((Number(process.env.DEMO_STORAGE_CAP_MB) || 200) * 1024 ** 2);
const MAX_UPLOAD_BYTES = Math.round((Number(process.env.MAX_UPLOAD_MB) || 100) * 1024 ** 2);
// Hour (server local time) at which the demo workspace is reset to the sample content every day.
const DEMO_RESET_HOUR = Number(process.env.DEMO_RESET_HOUR ?? 3);
// Passkeys (WebAuthn) are bound to the site's origin. List every address people open the app at.
const APP_ORIGINS = (process.env.APP_ORIGINS || `http://localhost:${PORT},http://127.0.0.1:${PORT}`)
  .split(",").map(s => s.trim().replace(/\/$/, "")).filter(Boolean);

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("[FATAL] JWT_SECRET is missing or shorter than 32 characters.");
  console.error("        Set it in the environment or in a .env file (see .env.example).");
  console.error(`        Example value: ${crypto.randomBytes(48).toString("base64url")}`);
  process.exit(1);
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

// =========================================================================
// 1. USER STORE — loaded once, kept in memory, written atomically
// =========================================================================
const SEED_ACCOUNTS = [
  { id: "user-admin", username: "admin", name: "Sys Admin", role: "admin", avatar: "icon-shield", color: "#ef4444" },
  { id: "user-demo", username: "demo", name: "Demo Utilizator", role: "user", avatar: "icon-user", color: "#8b5cf6", isDemo: true },
  { id: "user-demo-admin", username: "demo_admin", name: "Demo Admin", role: "admin", avatar: "icon-shield", color: "#f59e0b", isDemo: true }
];

let users = [];
let writeQueue = Promise.resolve();

function initUsersStore() {
  if (fs.existsSync(USERS_FILE)) {
    try {
      users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    } catch (e) {
      console.error(`[FATAL] ${USERS_FILE} is not valid JSON. Fix or remove it.`);
      process.exit(1);
    }
  }

  let modified = false;
  const today = new Date().toISOString().slice(0, 10);
  const hasUser = name => users.some(u => u.username.toLowerCase() === name);

  // Seeding only ADDS missing accounts; it never removes existing ones.
  for (const seed of SEED_ACCOUNTS) {
    if (hasUser(seed.username)) continue;
    let password;
    if (seed.isDemo) {
      if (!ENABLE_DEMO_ACCOUNTS) continue;
      password = DEMO_PASSWORD;
    } else {
      password = process.env.ADMIN_INITIAL_PASSWORD;
      if (!password || password.length < 12) {
        console.warn("[WARN] No 'admin' account exists and ADMIN_INITIAL_PASSWORD is unset or shorter than 12 characters.");
        console.warn("       Set ADMIN_INITIAL_PASSWORD and restart to create the administrator account.");
        continue;
      }
    }
    users.push({ ...seed, isDemo: Boolean(seed.isDemo), passwordHash: bcrypt.hashSync(password, 10), tokenVersion: 0, createdAt: today });
    modified = true;
  }

  for (const u of users) {
    if (typeof u.tokenVersion !== "number") { u.tokenVersion = 0; modified = true; }
    if ((u.username === "demo" || u.username === "demo_admin") && !u.isDemo) { u.isDemo = true; modified = true; }
  }

  if (modified || !fs.existsSync(USERS_FILE)) persistUsers();

  // Loud warning if a real (non-demo) account still uses a password that shipped in old source code.
  for (const u of users) {
    if (!u.isDemo && ["admin123", "demo123"].some(pw => bcrypt.compareSync(pw, u.passwordHash))) {
      console.warn(`[SECURITY] Account "${u.username}" still uses a default password that was published in the source. Change it now.`);
    }
  }
}

function persistUsers() {
  const snapshot = JSON.stringify(users, null, 2);
  writeQueue = writeQueue.then(async () => {
    const tmp = `${USERS_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, snapshot, "utf8");
    await fs.promises.rename(tmp, USERS_FILE);
  }).catch(err => console.error("Error saving users store:", err));
  return writeQueue;
}

const findUser = id => users.find(u => u.id === id);

// Strip secrets from anything sent to the browser.
function sanitizeUser(u) {
  if (!u) return null;
  const { passwordHash, tokenVersion, passkeys, ...safe } = u;
  return { ...safe, isDemo: Boolean(u.isDemo), passkeyCount: (passkeys || []).length };
}

function validatePassword(password, username) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { code: "password_too_short", error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (username && password.toLowerCase() === String(username).toLowerCase()) {
    return { code: "password_equals_username", error: "Password must not be the same as the username." };
  }
  return null;
}

// =========================================================================
// 1b. WORKSPACE DATA — real workspace + demo workspace (see lib/data-store.js)
// =========================================================================
const sampleContent = () => structuredClone({
  platforms: SEED.DEFAULT_PLATFORMS, posts: SEED.INITIAL_POSTS, events: SEED.INITIAL_EVENTS,
  spaces: SEED.DEFAULT_SPACES, rooms: SEED.DEFAULT_ROOMS
});
// A new install starts with a copy of the sample content; after that the file is yours.
const workspace = new DataStore({
  file: path.join(DATA_DIR, "workspace.json"), uploadsDir: path.join(DATA_DIR, "uploads"),
  urlPrefix: "/uploads", seed: sampleContent, capBytes: STORAGE_CAP_BYTES
});
// Demo accounts can edit freely; everything they change is thrown away on restart and every night.
const demoWorkspace = new DataStore({
  file: path.join(DATA_DIR, "demo.json"), uploadsDir: path.join(DATA_DIR, "demo-uploads"),
  urlPrefix: "/demo-uploads", seed: sampleContent, capBytes: DEMO_STORAGE_CAP_BYTES
});
const storeFor = user => (user && user.isDemo ? demoWorkspace : workspace);

// =========================================================================
// 2. EXPRESS APP & SECURITY MIDDLEWARE
// =========================================================================
const app = express();
app.disable("x-powered-by");

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "connect-src": ["'self'"],
      "font-src": ["'self'", "data:"],
      "object-src": ["'none'"],
      "frame-ancestors": ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Same-origin by default. Only enable CORS for explicitly listed origins.
if (ALLOWED_ORIGINS.length) {
  app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
}

// Small JSON bodies everywhere, except workspace sync batches, which get their own larger limit.
const smallJson = express.json({ limit: "100kb" });
app.use((req, res, next) => (req.path.startsWith("/api/data/") ? next() : smallJson(req, res, next)));
app.use(cookieParser());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 20, // attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." }
});

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax", secure: COOKIE_SECURE };

function authenticateToken(req, res, next) {
  req.user = null;
  const token = req.cookies.auth_token;
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = findUser(decoded.id);
    // A bumped tokenVersion (logout, password change) invalidates older tokens.
    if (user && (user.tokenVersion || 0) === (decoded.tv || 0)) req.user = sanitizeUser(user);
  } catch (err) {
    // invalid or expired token: treat as anonymous
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Administrator privileges required" });
  }
  next();
}

function blockDemoWrites(req, res, next) {
  if (req.user && req.user.isDemo) {
    return res.status(403).json({ code: "demo_read_only", error: "Conturile demonstrative sunt în mod de previzualizare (doar citire). Modificările nu pot fi salvate." });
  }
  next();
}

app.use("/api", authenticateToken);

// =========================================================================
// 3. AUTHENTICATION ENDPOINTS
// =========================================================================
app.post("/api/auth/login", loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const cleanUser = String(username).trim().toLowerCase();
  const user = users.find(u => u.username.toLowerCase() === cleanUser);
  if (!user || !bcrypt.compareSync(String(password), user.passwordHash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  startSession(res, user);
});

// Issues the session cookie (shared by password and passkey sign-in).
function startSession(res, user) {
  const payload = { id: user.id, role: user.role, tv: user.tokenVersion || 0 };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: `${TOKEN_TTL_HOURS}h` });
  res.cookie("auth_token", token, { ...COOKIE_OPTS, maxAge: TOKEN_TTL_HOURS * 3600 * 1000 });
  res.json({ success: true, user: sanitizeUser(user) });
}

app.post("/api/auth/logout", async (req, res) => {
  // Revoke every token issued to this user so a copied cookie stops working too.
  // Demo accounts are shared, so logging out one visitor must not sign out the others.
  const user = req.user && findUser(req.user.id);
  if (user && !user.isDemo) {
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await persistUsers();
  }
  res.clearCookie("auth_token", COOKIE_OPTS);
  res.json({ success: true });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.user) return res.json({ authenticated: false, user: null });
  res.json({ authenticated: true, user: req.user });
});

// =========================================================================
// 3b. PASSKEYS (WebAuthn, via @passwordless-id/webauthn)
// =========================================================================
// One-time challenges live in memory for 5 minutes. Each is bound to its purpose (and user).
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const challenges = new Map(); // challenge -> { purpose, userId, expires }

function issueChallenge(purpose, userId = null) {
  const now = Date.now();
  for (const [c, v] of challenges) if (v.expires < now) challenges.delete(c);
  const challenge = webauthn.randomChallenge();
  challenges.set(challenge, { purpose, userId, expires: now + CHALLENGE_TTL_MS });
  return challenge;
}

// Returns true and consumes the challenge if it is valid for this purpose/user.
function consumeChallenge(challenge, purpose, userId = null) {
  const entry = challenges.get(challenge);
  challenges.delete(challenge);
  return Boolean(entry && entry.purpose === purpose && entry.expires >= Date.now() && (userId === null || entry.userId === userId));
}

// Challenge embedded in the signed clientData (base64url JSON).
function clientChallenge(json) {
  try { return JSON.parse(Buffer.from(json.response.clientDataJSON, "base64url").toString("utf8")).challenge; }
  catch { return null; }
}

const passkeySummary = k => ({ id: k.id, name: k.name, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt || null });
const findPasskeyOwner = credentialId => users.find(u => (u.passkeys || []).some(k => k.id === credentialId));

// Registration, step 1: a challenge for the signed-in user.
app.post("/api/passkeys/register/options", requireAuth, blockDemoWrites, (req, res) => {
  const user = findUser(req.user.id);
  res.json({
    challenge: issueChallenge("register", user.id),
    user: { id: user.id, name: user.username, displayName: user.name },
    excludeCredentials: (user.passkeys || []).map(k => ({ id: k.id, type: "public-key", transports: k.transports || [] }))
  });
});

// Registration, step 2: verify the new credential and store its public key.
app.post("/api/passkeys/register", requireAuth, blockDemoWrites, async (req, res) => {
  const user = findUser(req.user.id);
  const { registration, name } = req.body || {};
  const challenge = registration && clientChallenge(registration);
  if (!challenge || !consumeChallenge(challenge, "register", user.id)) {
    return res.status(400).json({ code: "passkey_challenge_invalid", error: "Passkey request expired. Please try again." });
  }
  try {
    const info = await webauthn.verifyRegistration(registration, {
      challenge, // one-time and bound to this user (checked above)
      origin: origin => APP_ORIGINS.includes(origin),
      userVerified: true
    });
    if (findPasskeyOwner(info.credential.id)) return res.status(409).json({ code: "passkey_exists", error: "This passkey is already registered." });
    const passkey = {
      id: info.credential.id,
      publicKey: info.credential.publicKey,
      algorithm: info.credential.algorithm,
      transports: info.credential.transports || [],
      counter: info.authenticator.counter || 0,
      name: String(name || info.authenticator.name || "Passkey").slice(0, 60),
      createdAt: new Date().toISOString()
    };
    user.passkeys = [...(user.passkeys || []), passkey];
    await persistUsers();
    res.status(201).json({ success: true, passkey: passkeySummary(passkey) });
  } catch (err) {
    res.status(400).json({ code: "passkey_invalid", error: "The passkey could not be verified." });
  }
});

// Sign-in, step 1: a challenge. Discoverable credentials: the browser lets the user pick an account.
app.post("/api/passkeys/login/options", loginLimiter, (req, res) => {
  res.json({ challenge: issueChallenge("login") });
});

// Sign-in, step 2: verify the signature with the stored public key and start a session.
app.post("/api/passkeys/login", loginLimiter, async (req, res) => {
  const { authentication } = req.body || {};
  const fail = () => res.status(401).json({ code: "passkey_login_failed", error: "Passkey sign-in failed." });
  const challenge = authentication && clientChallenge(authentication);
  if (!challenge || !consumeChallenge(challenge, "login")) return fail();
  const user = findPasskeyOwner(authentication.id);
  const passkey = user && user.passkeys.find(k => k.id === authentication.id);
  if (!passkey) return fail();
  try {
    const info = await webauthn.verifyAuthentication(authentication, passkey, {
      challenge, // one-time (checked above)
      origin: origin => APP_ORIGINS.includes(origin),
      userVerified: true,
      counter: passkey.counter || 0
    });
    passkey.counter = info.counter;
    passkey.lastUsedAt = new Date().toISOString();
    await persistUsers();
    startSession(res, user);
  } catch (err) {
    fail();
  }
});

// The signed-in user's passkeys.
app.get("/api/passkeys", requireAuth, (req, res) => {
  res.json((findUser(req.user.id).passkeys || []).map(passkeySummary));
});

app.delete("/api/passkeys/:credentialId", requireAuth, blockDemoWrites, async (req, res) => {
  const user = findUser(req.user.id);
  const before = (user.passkeys || []).length;
  user.passkeys = (user.passkeys || []).filter(k => k.id !== req.params.credentialId);
  if (user.passkeys.length === before) return res.status(404).json({ error: "Passkey not found" });
  await persistUsers();
  res.json({ success: true });
});

// Admin recovery: remove all passkeys of a user (lost or replaced device).
app.delete("/api/users/:id/passkeys", requireAdmin, blockDemoWrites, async (req, res) => {
  const user = findUser(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.passkeys = [];
  await persistUsers();
  res.json({ success: true });
});

// =========================================================================
// 4. USERS
// =========================================================================

// Minimal directory (names/colours) for every signed-in user — used by the events user filter.
// Demo visitors only ever see the demo accounts, never the real team.
const visibleUsers = viewer => (viewer.isDemo ? users.filter(u => u.isDemo) : users);

app.get("/api/users/directory", requireAuth, (req, res) => {
  res.json(visibleUsers(req.user).map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role, color: u.color, avatar: u.avatar, isDemo: Boolean(u.isDemo) })));
});

app.get("/api/users", requireAdmin, (req, res) => {
  res.json(visibleUsers(req.user).map(sanitizeUser));
});

app.post("/api/users", requireAdmin, blockDemoWrites, async (req, res) => {
  const { username, password, name, role, color, avatar } = req.body || {};
  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: "All required fields must be provided" });
  }

  const cleanUsername = String(username).trim().toLowerCase();
  if (users.some(u => u.username.toLowerCase() === cleanUsername)) {
    return res.status(409).json({ error: "Username is already taken" });
  }
  const pwError = validatePassword(password, cleanUsername);
  if (pwError) return res.status(400).json(pwError);

  const safeRole = (role === "admin" || role === "moderator") ? role : "user";
  const newUser = {
    id: "user-" + Date.now(),
    username: cleanUsername,
    passwordHash: bcrypt.hashSync(password, 10),
    tokenVersion: 0,
    name: String(name).trim(),
    role: safeRole,
    avatar: avatar || (safeRole === "user" ? "icon-user" : "icon-shield"),
    color: color || (safeRole === "moderator" ? "#8b5cf6" : "#0ea5e9"),
    createdAt: new Date().toISOString().slice(0, 10)
  };

  users.push(newUser);
  await persistUsers();
  res.status(201).json({ success: true, user: sanitizeUser(newUser) });
});

app.put("/api/users/:id", requireAdmin, blockDemoWrites, async (req, res) => {
  const { id } = req.params;
  const { username, password, name, role, color, avatar } = req.body || {};
  const targetUser = findUser(id);
  if (!targetUser) return res.status(404).json({ error: "User not found" });

  const isRootAdmin = targetUser.username.toLowerCase() === "admin";
  if (isRootAdmin && username && username.toLowerCase() !== "admin") {
    return res.status(403).json({ error: "System Administrator account username cannot be changed" });
  }

  if (username && username.toLowerCase() !== targetUser.username.toLowerCase()) {
    const clean = username.trim().toLowerCase();
    if (users.some(u => u.id !== id && u.username.toLowerCase() === clean)) {
      return res.status(409).json({ error: "Username is already in use by another account" });
    }
    targetUser.username = clean;
  }

  if (password && password.trim().length > 0) {
    const pwError = validatePassword(password.trim(), targetUser.username);
    if (pwError) return res.status(400).json(pwError);
    targetUser.passwordHash = bcrypt.hashSync(password.trim(), 10);
    targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1; // sign out everywhere
  }

  if (name) targetUser.name = name.trim();
  if (role) targetUser.role = isRootAdmin ? "admin" : ((role === "admin" || role === "moderator") ? role : "user");
  if (color) targetUser.color = color;
  if (avatar) targetUser.avatar = avatar;

  await persistUsers();
  res.json({ success: true, user: sanitizeUser(targetUser) });
});

app.delete("/api/users/:id", requireAdmin, blockDemoWrites, async (req, res) => {
  const { id } = req.params;
  const targetUser = findUser(id);
  if (!targetUser) return res.status(404).json({ error: "User not found" });
  if (targetUser.username.toLowerCase() === "admin") {
    return res.status(403).json({ error: "System Administrator account cannot be deleted" });
  }
  if (req.user.id === id) {
    return res.status(400).json({ error: "You cannot delete your own active account while logged in" });
  }

  users = users.filter(u => u.id !== id);
  await persistUsers();
  res.json({ success: true, message: `User "${targetUser.name}" deleted successfully` });
});

// =========================================================================
// 4b. WORKSPACE DATA ENDPOINTS
// =========================================================================
const isStaff = user => user.role === "admin" || user.role === "moderator";
const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Who may change what. Mirrors the rules in the browser (canEditEvent, canBookRooms, admin-only screens).
function authorizeChange(user, collection) {
  return (action, item, existing) => {
    if (collection !== "events") return user.role === "admin" ? null : "admin_only";
    if (user.role === "admin") return null;
    if (action === "order") return "admin_only";
    if (existing && existing.creatorId !== user.id) return "not_your_event";
    if (item) {
      if (item.creatorId !== user.id) return "not_your_event";
      const bookingChanged = item.entryType === "room_only" || !sameJson(item.roomBookings?.length ? item.roomBookings : null, existing?.roomBookings?.length ? existing.roomBookings : null);
      if (bookingChanged && !isStaff(user)) return "rooms_staff_only";
    }
    return null;
  };
}

app.get("/api/data", requireAuth, (req, res) => {
  res.json(storeFor(req.user).snapshot());
});

app.post("/api/data/:collection/sync", requireAuth, express.json({ limit: "5mb" }), async (req, res) => {
  const { collection } = req.params;
  if (!COLLECTIONS.includes(collection)) return res.status(404).json({ error: "Unknown collection" });
  const result = await storeFor(req.user).sync(collection, req.body, authorizeChange(req.user, collection));
  if (result.status !== 200) return res.status(result.status).json({ code: result.code, error: result.code });
  res.json({ success: true, storage: result.storage });
});

app.post("/api/uploads", requireAuth, express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ code: "empty_upload", error: "empty_upload" });
  const result = await storeFor(req.user).saveUpload(req.body);
  if (result.status !== 201) return res.status(result.status).json({ code: result.code, error: result.code });
  res.status(201).json({ url: result.url, type: result.type, storage: result.storage });
});

// Test-only: put both workspaces back to the sample content between tests.
if (process.env.NODE_ENV === "test") {
  app.post("/api/test/reset-data", async (req, res) => {
    await workspace.init({ reset: true });
    await demoWorkspace.init({ reset: true });
    res.json({ success: true });
  });
}

app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// =========================================================================
// 5. STATIC ASSETS — only the public/ folder is ever served
// =========================================================================
app.use(express.static(PUBLIC_DIR, { index: "index.html", dotfiles: "deny" }));
// Uploaded media: random file names, types checked on upload, never executed or sniffed.
const mediaOpts = { dotfiles: "deny", index: false, maxAge: "30d", immutable: true, setHeaders: r => r.setHeader("X-Content-Type-Options", "nosniff") };
app.use("/uploads", express.static(workspace.uploadsDir, mediaOpts));
app.use("/demo-uploads", express.static(demoWorkspace.uploadsDir, mediaOpts));
// Browser build of the passkey library, served from node_modules (same origin, allowed by the CSP).
app.get("/vendor/webauthn.js", (req, res) => {
  res.type("text/javascript").sendFile(path.join(__dirname, "node_modules/@passwordless-id/webauthn/dist/browser/webauthn.min.js"));
});

// SPA fallback for page navigations only; everything else is a plain 404.
app.get(/.*/, (req, res, next) => {
  if (req.path.includes(".") || !req.accepts("html")) return next();
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});
app.use((req, res) => res.status(404).send("Not found"));

// =========================================================================
// 6. STARTUP
// =========================================================================
initUsersStore();
try {
  await workspace.init();
  await demoWorkspace.init({ reset: true });
} catch (e) {
  console.error(`[FATAL] ${e.message}`);
  process.exit(1);
}

// Hourly: drop media nobody saved, and reset the demo workspace once a day at DEMO_RESET_HOUR.
let lastDemoReset = new Date().toDateString();
setInterval(() => {
  workspace.collectGarbage();
  demoWorkspace.collectGarbage();
  const now = new Date();
  if (now.getHours() >= DEMO_RESET_HOUR && now.toDateString() !== lastDemoReset) {
    lastDemoReset = now.toDateString();
    demoWorkspace.init({ reset: true }).then(() => console.log("Demo workspace reset to sample content."));
  }
}, 60 * 60 * 1000).unref();

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`\nSocial Calendar running at http://localhost:${PORT}`);
  console.log(`Users store: ${USERS_FILE}`);
  console.log(`Data folder: ${DATA_DIR}\n`);
});
