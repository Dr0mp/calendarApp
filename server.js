import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "social_cal_jwt_secure_secret_2026_k9x2";
const USERS_FILE = path.join(__dirname, "users.json");

// =========================================================================
// 1. DATA PERSISTENCE & AUTO-SEEDING FOR USERS
// =========================================================================
const DEFAULT_SEED_USERS = [
  {
    id: "user-admin",
    username: "admin",
    password: "admin123",
    name: "Sys Admin",
    role: "admin",
    avatar: "icon-shield",
    color: "#ef4444",
    createdAt: "2026-09-01"
  },
  {
    id: "user-demo",
    username: "demo",
    password: "demo123",
    name: "Demo Utilizator (Preview)",
    role: "user",
    avatar: "icon-user",
    color: "#8b5cf6",
    createdAt: "2026-09-01",
    isDemo: true
  },
  {
    id: "user-demo-admin",
    username: "demo_admin",
    password: "demo123",
    name: "Demo Admin (Preview)",
    role: "admin",
    avatar: "icon-shield",
    color: "#f59e0b",
    createdAt: "2026-09-01",
    isDemo: true
  }
];

function initUsersStore() {
  let users = [];
  if (fs.existsSync(USERS_FILE)) {
    try {
      users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    } catch (e) {
      users = [];
    }
  }

  // Filter out any legacy accounts
  const allowedUsernames = ["admin", "demo", "demo_admin"];
  const prevLen = users.length;
  users = users.filter(u => allowedUsernames.includes(u.username.toLowerCase()));
  let modified = users.length !== prevLen;

  // Ensure default demo and seed accounts exist
  DEFAULT_SEED_USERS.forEach(seed => {
    const exists = users.some(u => u.username.toLowerCase() === seed.username.toLowerCase());
    if (!exists) {
      users.push({
        id: seed.id,
        username: seed.username,
        passwordHash: bcrypt.hashSync(seed.password, 10),
        name: seed.name,
        role: seed.role,
        avatar: seed.avatar,
        color: seed.color,
        createdAt: seed.createdAt,
        isDemo: !!seed.isDemo
      });
      modified = true;
    }
  });

  // Ensure isDemo flag is set on demo users
  users.forEach(u => {
    if (u.username === "demo" || u.username === "demo_admin") {
      if (!u.isDemo) {
        u.isDemo = true;
        modified = true;
      }
    }
  });

  if (modified || !fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
    console.log("🔒 Synced secure users store (users.json) with demo & seeded accounts.");
  }
}

function loadUsers() {
  try {
    initUsersStore();
    const data = fs.readFileSync(USERS_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading users.json:", err);
    return [];
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
  } catch (err) {
    console.error("Error saving users.json:", err);
  }
}

// Sanitize user for public responses (strip passwordHash)
function sanitizeUser(u) {
  if (!u) return null;
  const { passwordHash, ...safe } = u;
  return { ...safe, isDemo: Boolean(u.isDemo || u.username === "demo" || u.username === "demo_admin") };
}

// =========================================================================
// 2. EXPRESS APP & SECURITY MIDDLEWARE
// =========================================================================
const app = express();

app.use(helmet({
  contentSecurityPolicy: false, // Allow local fonts, inline SVG sprites, styles
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// Block direct external access to server data files
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (p === "/users.json" || p.startsWith("/.git") || p.endsWith(".env")) {
    return res.status(403).json({ error: "Access denied" });
  }
  next();
});

// Rate limiting on login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." }
});

// Auth helper middleware
function authenticateToken(req, res, next) {
  const token = req.cookies.auth_token;
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const users = loadUsers();
    const user = users.find(u => u.id === decoded.id);
    req.user = user ? sanitizeUser(user) : null;
  } catch (err) {
    req.user = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
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
    return res.status(403).json({ error: "Conturile demonstrative sunt în mod de previzualizare (doar citire). Modificările nu pot fi salvate." });
  }
  next();
}

app.use(authenticateToken);

// =========================================================================
// 3. REST AUTHENTICATION ENDPOINTS
// =========================================================================

// POST /api/auth/login
app.post("/api/auth/login", loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const users = loadUsers();
  const cleanUser = username.trim().toLowerCase();
  const user = users.find(u => u.username.toLowerCase() === cleanUser);

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const isDemo = Boolean(user.isDemo || user.username === "demo" || user.username === "demo_admin");
  const payload = { id: user.id, username: user.username, role: user.role, isDemo };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

  res.cookie("auth_token", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  res.json({
    success: true,
    user: sanitizeUser(user)
  });
});

// POST /api/auth/logout
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("auth_token", { httpOnly: true, sameSite: "lax" });
  res.json({ success: true, message: "Logged out successfully" });
});

// GET /api/auth/me
app.get("/api/auth/me", (req, res) => {
  if (!req.user) {
    return res.json({ authenticated: false, user: null });
  }
  res.json({ authenticated: true, user: req.user });
});

// =========================================================================
// 4. REST USER MANAGEMENT ENDPOINTS (ADMIN ONLY)
// =========================================================================

// GET /api/users
app.get("/api/users", requireAdmin, (req, res) => {
  const users = loadUsers();
  res.json(users.map(sanitizeUser));
});

// POST /api/users
app.post("/api/users", requireAdmin, blockDemoWrites, (req, res) => {
  const { username, password, name, role, color, avatar } = req.body || {};
  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: "All required fields must be provided" });
  }

  const users = loadUsers();
  const cleanUsername = username.trim().toLowerCase();

  if (users.some(u => u.username.toLowerCase() === cleanUsername)) {
    return res.status(409).json({ error: "Username is already taken" });
  }

  const newUser = {
    id: "user-" + Date.now(),
    username: cleanUsername,
    passwordHash: bcrypt.hashSync(password, 10),
    name: name.trim(),
    role: (role === "admin" || role === "moderator") ? role : "user",
    avatar: avatar || (role === "admin" ? "icon-shield" : (role === "moderator" ? "icon-shield" : "icon-user")),
    color: color || (role === "moderator" ? "#8b5cf6" : "#0ea5e9"),
    createdAt: new Date().toISOString().split("T")[0]
  };

  users.push(newUser);
  saveUsers(users);

  res.status(201).json({ success: true, user: sanitizeUser(newUser) });
});

// PUT /api/users/:id
app.put("/api/users/:id", requireAdmin, blockDemoWrites, (req, res) => {
  const { id } = req.params;
  const { username, password, name, role, color, avatar } = req.body || {};

  const users = loadUsers();
  const index = users.findIndex(u => u.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "User not found" });
  }

  const targetUser = users[index];

  // Protect system admin username from being changed
  if (targetUser.username.toLowerCase() === "admin" && (username && username.toLowerCase() !== "admin")) {
    return res.status(403).json({ error: "System Administrator account username cannot be changed" });
  }

  // Check username collision if changed
  if (username && username.toLowerCase() !== targetUser.username.toLowerCase()) {
    if (users.some(u => u.id !== id && u.username.toLowerCase() === username.trim().toLowerCase())) {
      return res.status(409).json({ error: "Username is already in use by another account" });
    }
    targetUser.username = username.trim().toLowerCase();
  }

  if (name) targetUser.name = name.trim();
  if (role) {
    // Cannot demote root admin
    if (targetUser.username.toLowerCase() === "admin") {
      targetUser.role = "admin";
    } else {
      targetUser.role = (role === "admin" || role === "moderator") ? role : "user";
    }
  }
  if (color) targetUser.color = color;
  if (avatar) targetUser.avatar = avatar;

  // Optional password update
  if (password && password.trim().length > 0) {
    targetUser.passwordHash = bcrypt.hashSync(password.trim(), 10);
  }

  users[index] = targetUser;
  saveUsers(users);

  res.json({ success: true, user: sanitizeUser(targetUser) });
});

// DELETE /api/users/:id
app.delete("/api/users/:id", requireAdmin, blockDemoWrites, (req, res) => {
  const { id } = req.params;
  const users = loadUsers();
  const targetUser = users.find(u => u.id === id);

  if (!targetUser) {
    return res.status(404).json({ error: "User not found" });
  }

  // Protected root system admin
  if (targetUser.username.toLowerCase() === "admin") {
    return res.status(403).json({ error: "System Administrator account cannot be deleted" });
  }

  // Prevent deleting your own active account
  if (req.user && req.user.id === id) {
    return res.status(400).json({ error: "You cannot delete your own active account while logged in" });
  }

  const filtered = users.filter(u => u.id !== id);
  saveUsers(filtered);

  res.json({ success: true, message: `User "${targetUser.name}" deleted successfully` });
});

// =========================================================================
// 5. STATIC ASSET SERVING & FALLBACK
// =========================================================================
app.use(express.static(__dirname));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// =========================================================================
// 6. SERVER STARTUP
// =========================================================================
initUsersStore();

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Multi-Platform Social Calendar is running at:`);
  console.log(`   👉 http://localhost:${PORT}`);
  console.log(`🔒 Server-Side Authentication & Session Security ACTIVE`);
  console.log(`======================================================\n`);
});
