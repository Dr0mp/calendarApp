// Passkeys (WebAuthn) end to end, using Chromium's virtual authenticator (no real device needed).
import { test, expect, request as pwRequest } from '@playwright/test';
import { boot, login, ADMIN_PW } from './helpers.js';

async function addVirtualAuthenticator(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return { cdp, authenticatorId };
}

test('register a passkey, sign out, sign back in with it, then remove it', async ({ page }) => {
  const errors = await boot(page);
  await addVirtualAuthenticator(page);
  await login(page, 'admin', ADMIN_PW, { ui: true });

  await page.click('#nav-passkeys-btn');
  await expect(page.locator('#passkeys-dialog')).toBeVisible();
  await page.fill('#passkey-name-input', 'Test laptop');
  await page.click('#passkey-add-btn');
  await expect(page.locator('.toast--success')).toBeVisible();
  await expect(page.locator('#passkeys-list .passkey-item')).toHaveCount(1);
  await expect(page.locator('#passkeys-list')).toContainText('Test laptop');
  await page.click('#close-passkeys-dialog-btn');

  await page.click('#nav-logout-btn');
  await expect(page.locator('#direct-login-view')).toBeVisible();
  await expect(page.locator('#passkey-login-btn')).toBeVisible();
  await page.click('#passkey-login-btn');
  await expect(page.locator('#universal-nav-bar')).toBeVisible();
  await expect(page.locator('#nav-user-name')).toContainText('Admin');

  await page.click('#nav-passkeys-btn');
  await page.click('#passkeys-list .passkey-remove-btn');
  await page.locator('dialog.feedback-dialog button[value="ok"]').click();
  await expect(page.locator('#passkeys-list .passkey-item')).toHaveCount(0);
  await expect(page.locator('#passkeys-empty')).toBeVisible();
  expect(errors).toEqual([]);
});

test('admin can remove all passkeys of a user (lost device)', async ({ page }) => {
  const errors = await boot(page);
  await addVirtualAuthenticator(page);
  await login(page, 'admin', ADMIN_PW, { ui: true });
  await page.click('#nav-passkeys-btn');
  await page.click('#passkey-add-btn');
  await expect(page.locator('#passkeys-list .passkey-item')).toHaveCount(1);
  await page.click('#close-passkeys-dialog-btn');

  await page.click('#nav-admin-btn');
  await page.click('#admin-cat-users');
  await page.locator('#admin-users-table-body tr', { hasText: '@admin' }).locator('.btn-edit-user').click();
  await expect(page.locator('#edit-user-passkeys-row')).toBeVisible();
  await page.click('#edit-user-reset-passkeys-btn');
  await page.locator('dialog.feedback-dialog button[value="ok"]').click();
  await expect(page.locator('#edit-user-passkeys-row')).toBeHidden();
  expect(errors).toEqual([]);
});

test('demo accounts cannot add passkeys and do not see the passkey button', async ({ page }) => {
  await boot(page); await login(page, 'demo_admin');
  await expect(page.locator('#nav-passkeys-btn')).toBeHidden();
  const ctx = await pwRequest.newContext({ baseURL: 'http://localhost:3100' });
  await ctx.post('/api/auth/login', { data: { username: 'demo', password: 'demo123' } });
  expect((await ctx.post('/api/passkeys/register/options')).status()).toBe(403);
});

test('passkey API rejects forged or replayed requests', async () => {
  const anon = await pwRequest.newContext({ baseURL: 'http://localhost:3100' });
  expect((await anon.post('/api/passkeys/register/options')).status()).toBe(401);
  expect((await anon.get('/api/passkeys')).status()).toBe(401);
  // a login attempt with a challenge the server never issued
  const fakeClientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: 'never-issued', origin: 'http://localhost:3100' })).toString('base64url');
  const r = await anon.post('/api/passkeys/login', { data: { authentication: { id: 'x', rawId: 'x', type: 'public-key', response: { clientDataJSON: fakeClientData, authenticatorData: 'AA', signature: 'AA' } } } });
  expect(r.status()).toBe(401);
  // options work anonymously and give a fresh challenge each time
  const a = await (await anon.post('/api/passkeys/login/options')).json();
  const b = await (await anon.post('/api/passkeys/login/options')).json();
  expect(a.challenge).toBeTruthy(); expect(a.challenge).not.toBe(b.challenge);
  // the library is served same-origin
  expect((await anon.get('/vendor/webauthn.js')).status()).toBe(200);
});
