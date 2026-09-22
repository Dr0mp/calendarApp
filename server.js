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
// Demo accounts are read-only previews (see blockDemoWrites); their password is shown on the login screen.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "demo123";
const MIN_PASSWORD_LENGTH = 10;

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
  const { passwordHash, tokenVersion, ...safe } = u;
  return { ...safe, isDemo: Boolean(u.isDemo) };
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

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
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

  const payload = { id: user.id, role: user.role, tv: user.tokenVersion || 0 };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: `${TOKEN_TTL_HOURS}h` });
  res.cookie("auth_token", token, { ...COOKIE_OPTS, maxAge: TOKEN_TTL_HOURS * 3600 * 1000 });
  res.json({ success: true, user: sanitizeUser(user) });
});

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
// 4. USERS
// =========================================================================

// Minimal directory (names/colours) for every signed-in user — used by the events user filter.
app.get("/api/users/directory", requireAuth, (req, res) => {
  res.json(users.map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role, color: u.color, avatar: u.avatar, isDemo: Boolean(u.isDemo) })));
});

app.get("/api/users", requireAdmin, (req, res) => {
  res.json(users.map(sanitizeUser));
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

app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// =========================================================================
// 5. STATIC ASSETS — only the public/ folder is ever served
// =========================================================================
app.use(express.static(PUBLIC_DIR, { index: "index.html", dotfiles: "deny" }));

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

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`\nSocial Calendar running at http://localhost:${PORT}`);
  console.log(`Users store: ${USERS_FILE}\n`);
});
