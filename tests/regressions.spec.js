// Regression tests for bugs found in the audits (dead-code audit A1–A5).
import { test, expect } from '@playwright/test';
import { boot, login, ADMIN_PW } from './helpers.js';

test('A1: wizard back button is translated, not the raw key "cancel"', async ({ page }) => {
  const errors = await boot(page); await login(page, 'demo_admin');
  await page.click('#nav-schedule-btn');
  await expect(page.locator('#wizard-prev-btn')).toHaveText('Anulează');
  expect(errors).toEqual([]);
});

test('A2: "today" follows the real clock, not 15 Sep 2026', async ({ page }) => {
  await boot(page, { now: new Date('2026-11-03T10:00:00+02:00') }); await login(page, 'demo_admin');
  await page.click('#nav-events-btn');
  await page.click('#btn-zoom-monthly');
  await expect(page.locator('#events-current-month-label')).toContainText('Noiembrie');
  await page.click('#events-prev-month-btn');
  await page.click('#events-today-btn');
  await expect(page.locator('#events-current-month-label')).toContainText('Noiembrie');
  await page.click('#nav-social-btn');
  await expect(page.locator('#current-month-label')).toContainText('Noiembrie');
});

test('A3: a stale "show only what we have" preference no longer hides platforms', async ({ page }) => {
  await boot(page, { storage: { social_cal_prefs_2026_v1: JSON.stringify({ showOnlyWhatWeHave: true }) } });
  await login(page, 'demo_admin');
  const withPref = await page.locator('#platform-filter-bar button').count();
  const ctx2 = await page.context().browser().newContext({ baseURL: 'http://localhost:3100' });
  const p2 = await ctx2.newPage(); await boot(p2); await login(p2, 'demo_admin');
  const fresh = await p2.locator('#platform-filter-bar button').count();
  await ctx2.close();
  expect(withPref).toBe(fresh);
});

test('A4: a forged localStorage session does not open the app', async ({ page }) => {
  await boot(page, { storage: { cal_suite_auth_session_v1: JSON.stringify({ id: 'user-admin', username: 'admin', name: 'X', role: 'admin' }) } });
  await expect(page.locator('#direct-login-view')).toBeVisible();
  await expect(page.locator('#universal-nav-bar')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('cal_suite_auth_session_v1'))).toBeNull();
});

test('A5: notification cards carry the is-pending / is-promoted state classes', async ({ page }) => {
  await boot(page); await login(page, 'demo_admin');
  await page.click('#btn-social-event-notifications');
  const cards = page.locator('#social-notifications-list .event-notification-card');
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await expect(cards.nth(i)).toHaveClass(/\bis-(pending|promoted)\b/);
});

test('orphan element refs: applying a smart suggestion no longer throws', async ({ page }) => {
  const errors = await boot(page); await login(page, 'demo_admin');
  await page.click('#nav-schedule-btn');
  const apply = page.locator('.btn-apply-suggestion').first();
  await expect(apply).toBeVisible();
  await apply.click();
  await page.waitForTimeout(200);
  expect(errors).toEqual([]);
});

test('orphan element refs: picking a free-hour slot no longer throws', async ({ page }) => {
  const errors = await boot(page); await login(page, 'demo_admin');
  await page.click('#nav-schedule-btn');
  await page.fill('#event-title-input', 'Slot test');
  await page.selectOption('#event-space-select', { index: 1 });
  await page.click('#wizard-next-btn');
  const slot = page.locator('#event-free-hours-board .hour-slot-chip.free').first();
  await expect(slot).toBeVisible();
  await slot.click();
  await page.waitForTimeout(200);
  expect(errors).toEqual([]);
});

test('P6.9: events saved by older builds (date/time fields only) are migrated and still render', async ({ page }) => {
  const legacy = [{ id: 'evt-legacy', creatorId: 'user-demo-admin', creatorUsername: 'demo_admin', creatorName: 'Demo Admin',
    title: 'Legacy Shape Event', date: '2026-09-21', time: '09:30', durationHours: 1, entryType: 'event', spaceId: null, color: '#0ea5e9', socialStatus: 'none' }];
  const errors = await boot(page, { storage: { cal_suite_events_v1: JSON.stringify(legacy) } });
  await login(page, 'demo_admin');
  await page.click('#nav-my-events-btn');
  await expect(page.locator('#my-events-list-container')).toContainText('Legacy Shape Event');
  await expect(page.locator('#my-events-list-container')).toContainText('2026-09-21');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cal_suite_events_v1'))[0]);
  expect(stored).toMatchObject({ startDate: '2026-09-21', endDate: '2026-09-21', hour: '09:30' });
  expect(stored).not.toHaveProperty('date');
  expect(stored).not.toHaveProperty('time');
  expect(errors).toEqual([]);
});

test('P9.7: validation messages are in-app toasts, not browser alerts', async ({ page }) => {
  const errors = await boot(page); await login(page, 'demo_admin');
  let nativeDialogs = 0; page.on('dialog', () => nativeDialogs++);
  await page.click('#nav-schedule-btn');
  await page.click('#wizard-next-btn'); // no title yet
  await expect(page.locator('.toast')).toContainText(/titlu|title/i);
  expect(nativeDialogs).toBe(0);
  expect(errors).toEqual([]);
});

test('P9.7: deleting an event asks with an in-app confirm dialog', async ({ page }) => {
  const errors = await boot(page); await login(page, 'admin', ADMIN_PW);
  // create an event owned by admin
  await page.click('#nav-schedule-btn');
  await page.fill('#event-title-input', 'Delete Me Event');
  await page.selectOption('#event-space-select', { index: 1 });
  await page.click('#wizard-next-btn');
  await page.fill('#event-date-input', '2026-09-25');
  await page.fill('#event-hour-input', '11:00');
  for (let i = 0; i < 5 && !(await page.locator('#save-event-btn').isVisible()); i++) await page.click('#wizard-next-btn');
  await page.click('#btn-use-fb-sample'); await page.waitForTimeout(300);
  await page.click('#save-event-btn');
  await page.click('#nav-my-events-btn');
  const card = page.locator('.my-event-card', { hasText: 'Delete Me Event' });
  await card.locator('.btn-my-event-delete').click();
  const dlg = page.locator('dialog.feedback-dialog');
  await expect(dlg).toBeVisible();
  await dlg.locator('button[value="cancel"]').click();
  await expect(card).toBeVisible();
  await card.locator('.btn-my-event-delete').click();
  await dlg.locator('button[value="ok"]').click();
  await expect(page.locator('#my-events-list-container')).not.toContainText('Delete Me Event');
  expect(errors).toEqual([]);
});
