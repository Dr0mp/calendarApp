// Starts the app server on :3100 with a throwaway users store so tests never touch the real users.json.
import fs from 'fs'; import path from 'path'; import os from 'os';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cal-users-'));
process.env.PORT = '3100';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';
process.env.USERS_FILE = path.join(tmp, 'users.json');
process.env.ADMIN_INITIAL_PASSWORD = 'Admin-Test-Password-1';
process.env.DEMO_PASSWORD = 'demo123';
process.env.NODE_ENV = 'test';
// Baseline server ignores USERS_FILE: back up and restore the real file around the run.
const real = path.resolve('users.json');
if (fs.existsSync(real)) { fs.copyFileSync(real, path.join(tmp, 'real-users.backup.json')); }
const restore = () => { const b = path.join(tmp, 'real-users.backup.json'); if (fs.existsSync(b)) fs.copyFileSync(b, real); };
process.on('SIGTERM', () => { restore(); process.exit(0); });
process.on('SIGINT', () => { restore(); process.exit(0); });
await import(path.resolve('server.js'));
