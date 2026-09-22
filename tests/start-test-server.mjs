// Starts the app server on :3100 with a throwaway users store so tests never touch the real users.json.
import fs from 'fs'; import path from 'path'; import os from 'os';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cal-users-'));
Object.assign(process.env, {
  PORT: '3100',
  JWT_SECRET: 'test-secret-not-for-production-0123456789abcdef',
  USERS_FILE: path.join(tmp, 'users.json'),
  ADMIN_INITIAL_PASSWORD: 'Admin-Test-Password-1',
  DEMO_PASSWORD: 'demo123',
  NODE_ENV: 'test',
  // Playwright restarts workers after failures, which re-logs in; don't let that trip the limiter.
  LOGIN_RATE_LIMIT_MAX: '1000',
});
await import(path.resolve('server.js'));
