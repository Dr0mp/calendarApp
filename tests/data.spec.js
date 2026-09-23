// Workspace data lives on the server: shared between browsers, per-user permissions, uploads, demo reset.
import { test, expect } from '@playwright/test';
import { boot, login, ADMIN_PW } from './helpers.js';

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');

test('an event saved in one browser shows up in another (no localStorage)', async ({ page, browser }) => {
  await boot(page); await login(page, 'admin', ADMIN_PW);
  await page.click('#nav-schedule-btn');
  await page.click('#btn-entry-type-event');
  await page.fill('#event-title-input', 'Shared Across Browsers');
  await page.selectOption('#event-space-select', { index: 1 });
  await page.click('#wizard-next-btn');
  await page.fill('#event-date-input', '2026-09-25');
  await page.fill('#event-hour-input', '11:00');
  while (await page.locator('#wizard-next-btn').isVisible()) await page.click('#wizard-next-btn');
  await page.click('#btn-use-fb-sample');
  await page.waitForTimeout(400);
  await page.click('#save-event-btn');
  await expect.poll(async () => (await (await page.request.get('/api/data')).json()).events.some(e => e.title === 'Shared Across Browsers')).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => /events|posts|platforms|spaces|rooms/.test(k)))).toEqual([]);

  const ctx2 = await browser.newContext({ baseURL: 'http://localhost:3100' });
  const p2 = await ctx2.newPage();
  await p2.goto('/');
  await login(p2, 'admin', ADMIN_PW, { ui: true });
  await p2.click('#nav-my-events-btn');
  await expect(p2.locator('#my-events-list-container')).toContainText('Shared Across Browsers');
  await ctx2.close();
});

test('demo accounts edit their own sample workspace, never the real one', async ({ page }) => {
  await boot(page); await login(page, 'demo_admin');
  const res = await page.request.post('/api/data/posts/sync', { data: { deletes: ['post-1'] } });
  expect(res.ok()).toBe(true);
  expect((await (await page.request.get('/api/data')).json()).posts.some(p => p.id === 'post-1')).toBe(false);
  await page.context().clearCookies();
  await page.reload();
  await login(page, 'admin', ADMIN_PW, { ui: true });
  expect((await (await page.request.get('/api/data')).json()).posts.some(p => p.id === 'post-1')).toBe(true);
});

test('server enforces who may change what', async ({ page }) => {
  await boot(page); await login(page, 'demo');
  const sync = (c, data) => page.request.post(`/api/data/${c}/sync`, { data });
  expect((await sync('posts', { deletes: ['post-1'] })).status()).toBe(403);
  expect((await sync('spaces', { upserts: [{ id: 'space-x', name: 'X' }] })).status()).toBe(403);
  const theirs = (await (await page.request.get('/api/data')).json()).events.find(e => e.creatorId !== 'user-demo');
  expect((await sync('events', { upserts: [{ ...theirs, title: 'hijack' }] })).status()).toBe(403);
  expect((await sync('events', { deletes: [theirs.id] })).status()).toBe(403);
  expect((await sync('events', { upserts: [{ id: 'evt-mine', creatorId: 'user-other', title: 'x' }] })).status()).toBe(403);
  expect((await sync('events', { upserts: [{ id: 'evt-mine', creatorId: 'user-demo', title: 'x', roomBookings: [{ roomId: 'room-1' }] }] })).status()).toBe(403);
  expect((await sync('events', { upserts: [{ id: 'evt-mine', creatorId: 'user-demo', title: 'x' }] })).ok()).toBe(true);
  expect((await sync('events', { upserts: [{ id: 'evt-b64', creatorId: 'user-demo', facebookImage: 'data:image/png;base64,AAAA' }] })).status()).toBe(400);
  await page.context().clearCookies();
  expect((await page.request.get('/api/data')).status()).toBe(401);
});

test('uploads: type-checked, stored as files, counted in storage, deleted with their record', async ({ page }) => {
  await boot(page); await login(page, 'admin', ADMIN_PW);
  const up = await page.request.post('/api/uploads', { headers: { 'Content-Type': 'image/png' }, data: PNG_1x1 });
  expect(up.status()).toBe(201);
  const { url } = await up.json();
  expect(url).toMatch(/^\/uploads\/[\w-]+\.png$/);
  const img = await page.request.get(url);
  expect(img.headers()['content-type']).toBe('image/png');
  expect(img.headers()['x-content-type-options']).toBe('nosniff');

  const svg = await page.request.post('/api/uploads', { headers: { 'Content-Type': 'image/svg+xml' }, data: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' });
  expect(svg.status()).toBe(415);

  const ev = { id: 'evt-img', creatorId: 'user-admin', title: 'With cover', startDate: '2026-09-25', endDate: '2026-09-25', hour: '10:00', facebookImage: url };
  const synced = await (await page.request.post('/api/data/events/sync', { data: { upserts: [ev] } })).json();
  expect(synced.storage.files[url]).toBe(PNG_1x1.length);
  await page.request.post('/api/data/events/sync', { data: { deletes: ['evt-img'] } });
  expect((await page.request.get(url)).status()).toBe(404);
});

test('picking a cover image uploads it and the event keeps only its URL', async ({ page }) => {
  await boot(page); await login(page, 'admin', ADMIN_PW);
  await page.click('#nav-schedule-btn');
  await page.click('#btn-entry-type-event');
  await page.fill('#event-title-input', 'Uploaded Cover');
  await page.selectOption('#event-space-select', { index: 1 });
  await page.click('#wizard-next-btn');
  await page.fill('#event-date-input', '2026-09-26');
  while (await page.locator('#wizard-next-btn').isVisible()) await page.click('#wizard-next-btn');
  // 16:9 PNG so the cover validator accepts it
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 160; c.height = 90;
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.setInputFiles('#event-fb-image-file', { name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await expect(page.locator('#event-fb-preview-box')).toBeVisible();
  await page.click('#save-event-btn');
  await expect.poll(async () => (await (await page.request.get('/api/data')).json()).events.find(e => e.title === 'Uploaded Cover')?.facebookImage || '').toMatch(/^\/uploads\//);
});

test('storage panel shows the server cap and real usage', async ({ page }) => {
  await boot(page); await login(page, 'admin', ADMIN_PW);
  await page.click('#nav-admin-btn');
  await page.click('#admin-cat-storage');
  await expect(page.locator('#admin-quota-limit-badge')).toContainText('8');
  await expect(page.locator('#admin-storage-total-text')).toContainText('8 GB');
});
