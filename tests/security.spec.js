import { test, expect, request as pwRequest } from '@playwright/test';
import { ADMIN_PW } from './helpers.js';

const BASE = 'http://localhost:3100';
async function session(username, password) {
  const ctx = await pwRequest.newContext({ baseURL: BASE });
  const r = await ctx.post('/api/auth/login', { data: { username, password } });
  expect(r.ok(), `login ${username}`).toBeTruthy();
  return ctx;
}

test('server source and data files are not served', async ({ request }) => {
  for (const p of ['/server.js', '/package.json', '/package-lock.json', '/users.json', '/run_server.bat',
    '/.env', '/.env.example', '/node_modules/express/package.json', '/tests/helpers.js', '/.git/config']) {
    const r = await request.get(BASE + p);
    expect(r.status(), p).toBe(404);
  }
  expect((await request.get(BASE + '/src/app.js')).status()).toBe(200);
  expect((await request.get(BASE + '/')).status()).toBe(200);
});

test('CSP header is set and CORS is not reflected for foreign origins', async ({ request }) => {
  const r = await request.get(BASE + '/api/auth/me', { headers: { Origin: 'https://evil.example' } });
  expect(r.headers()['content-security-policy']).toContain("default-src 'self'");
  expect(r.headers()['access-control-allow-origin']).toBeUndefined();
});

test('created users survive further requests (initUsersStore bug fixed)', async () => {
  const admin = await session('admin', ADMIN_PW);
  const username = 'persist_' + Date.now();
  const c = await admin.post('/api/users', { data: { username, password: 'LongEnough-123', name: 'Persist Test', role: 'user' } });
  expect(c.status()).toBe(201);
  for (let i = 0; i < 3; i++) await admin.get('/api/auth/me');
  const list = await (await admin.get('/api/users')).json();
  const created = list.find(u => u.username === username);
  expect(created).toBeTruthy();
  expect(JSON.stringify(list)).not.toContain('passwordHash');
  expect((await admin.delete('/api/users/' + created.id)).ok()).toBeTruthy();
});

test('password policy', async () => {
  const admin = await session('admin', ADMIN_PW);
  const short = await admin.post('/api/users', { data: { username: 'shorty', password: '1', name: 'S', role: 'user' } });
  expect(short.status()).toBe(400);
  expect((await short.json()).code).toBe('password_too_short');
  const same = await admin.post('/api/users', { data: { username: 'samename12', password: 'samename12', name: 'S', role: 'user' } });
  expect((await same.json()).code).toBe('password_equals_username');
});

test('logout revokes the token (copied cookie stops working)', async () => {
  const admin = await session('admin', ADMIN_PW);
  const state = await admin.storageState();
  const copy = await pwRequest.newContext({ baseURL: BASE, storageState: state });
  expect((await (await copy.get('/api/auth/me')).json()).authenticated).toBe(true);
  await admin.post('/api/auth/logout');
  expect((await (await copy.get('/api/auth/me')).json()).authenticated).toBe(false);
});

test('user directory is available to any signed-in user, full list only to admins', async () => {
  const demo = await session('demo', 'demo123');
  const dir = await demo.get('/api/users/directory');
  expect(dir.ok()).toBeTruthy();
  const rows = await dir.json();
  expect(rows.length).toBeGreaterThan(0);
  expect(Object.keys(rows[0]).sort()).toEqual(['avatar', 'color', 'id', 'isDemo', 'name', 'role', 'username']);
  expect((await demo.get('/api/users')).status()).toBe(403);
});

test('demo admin cannot write users', async () => {
  const demoAdmin = await session('demo_admin', 'demo123');
  const r = await demoAdmin.post('/api/users', { data: { username: 'x_demo_write', password: 'LongEnough-123', name: 'X', role: 'user' } });
  expect(r.status()).toBe(403);
});
