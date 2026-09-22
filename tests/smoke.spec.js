import { test, expect } from '@playwright/test';
import { boot, login, ADMIN_PW } from './helpers.js';

let errors;
test.afterEach(async () => { expect(errors, 'no console/page errors').toEqual([]); });

test('login screen then demo_admin lands on Social', async ({ page }) => {
  errors = await boot(page);
  await expect(page.locator('#direct-login-view')).toBeVisible();
  await login(page, 'demo_admin', 'demo123', { ui: true });
  await expect(page.locator('#social-calendar-app')).toBeVisible();
  await expect(page.locator('#nav-user-name')).toContainText('Demo Admin');
});

test('social views and platform filter', async ({ page }) => {
  errors = await boot(page); await login(page, 'demo_admin');
  await page.click('#view-month-btn'); await expect(page.locator('#calendar-view')).toBeVisible();
  await expect(page.locator('#calendar-days-grid .calendar-day-cell')).not.toHaveCount(0);
  await page.click('#view-feed-btn'); await expect(page.locator('#feed-view')).toBeVisible();
  await page.click('#view-year-btn'); await expect(page.locator('#social-year-view')).toBeVisible();
  const tabs = page.locator('#platform-filter-bar button');
  expect(await tabs.count()).toBeGreaterThan(2);
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveClass(/active/);
  await page.fill('#social-search-input', 'zzzz-no-match');
  await page.fill('#social-search-input', '');
});

test('events calendar zoom levels and navigation', async ({ page }) => {
  errors = await boot(page); await login(page, 'demo_admin');
  await page.click('#nav-events-btn');
  await expect(page.locator('#events-calendar-app')).toBeVisible();
  await page.click('#btn-zoom-yearly'); await expect(page.locator('#events-yearly-view')).toBeVisible();
  await page.click('#btn-zoom-monthly'); await expect(page.locator('#events-grid-view')).toBeVisible();
  const label = page.locator('#events-current-month-label');
  const before = await label.textContent();
  await page.click('#events-next-month-btn'); await expect(label).not.toHaveText(before);
  await page.click('#events-today-btn'); await expect(label).toHaveText(before);
  await page.click('#btn-zoom-daily'); await expect(page.locator('#events-daily-view')).toBeVisible();
});

async function wizardToEnd(page) {
  for (let i = 0; i < 5; i++) {
    if (await page.locator('#save-event-btn').isVisible()) break;
    await page.click('#wizard-next-btn'); await page.waitForTimeout(150);
  }
}

test('schedule wizard: public event saves and appears in My Events', async ({ page }) => {
  errors = await boot(page); await login(page, 'admin', ADMIN_PW);
  await page.click('#nav-schedule-btn');
  await page.click('#btn-entry-type-event');
  await page.fill('#event-title-input', 'Smoke Test Event');
  await page.selectOption('#event-space-select', { index: 1 });
  await page.click('#wizard-next-btn');
  await page.fill('#event-date-input', '2026-09-24');
  await page.fill('#event-hour-input', '10:00');
  await wizardToEnd(page);
  await page.click('#btn-use-fb-sample');
  await page.waitForTimeout(400);
  await page.click('#save-event-btn');
  await page.click('#nav-my-events-btn');
  await expect(page.locator('#my-events-list-container')).toContainText('Smoke Test Event');
});

test('schedule wizard: locked interval and room-only types reach the save step', async ({ page }) => {
  errors = await boot(page); await login(page, 'demo_admin');
  for (const type of ['#btn-entry-type-locked', '#btn-entry-type-room']) {
    await page.click('#nav-schedule-btn');
    await page.click(type);
    await expect(page.locator('#wizard-step-pane-1')).toBeVisible();
    await expect(page.locator('#wizard-next-btn')).toBeVisible();
  }
});

test('my events: filters, search, detail', async ({ page }) => {
  errors = await boot(page); await login(page, 'demo_admin');
  await page.click('#nav-my-events-btn');
  for (const f of ['public', 'room', 'locked', 'all']) {
    await page.click('#filter-my-events-' + f);
    await expect(page.locator('#filter-my-events-' + f)).toHaveClass(/active/);
  }
  await page.fill('#my-events-search-input', 'x');
  await page.fill('#my-events-search-input', '');
});

test('admin: every category renders', async ({ page }) => {
  errors = await boot(page); await login(page, 'demo_admin');
  await page.click('#nav-admin-btn');
  await expect(page.locator('#admin-app')).toBeVisible();
  for (const c of ['users', 'events', 'spaces', 'rooms', 'storage', 'all']) {
    await page.click('#admin-cat-' + c);
    await page.waitForTimeout(100);
  }
  await page.click('#admin-cat-users');
  await expect(page.locator('#admin-users-table-body tr')).not.toHaveCount(0);
});

test('notifications modal: filters', async ({ page }) => {
  errors = await boot(page); await login(page, 'demo_admin');
  await page.click('#btn-social-event-notifications');
  await expect(page.locator('#social-notifications-modal')).toBeVisible();
  const pills = page.locator('#notif-filter-bar button');
  for (let i = 0; i < await pills.count(); i++) await pills.nth(i).click();
  await page.click('#close-social-notifications-done-btn');
});

test('theme and language toggles', async ({ page }) => {
  errors = await boot(page); await login(page, 'demo_admin');
  const html = page.locator('html');
  const t0 = await html.getAttribute('data-theme');
  await page.click('#universal-nav-bar .theme-toggle');
  await expect(html).not.toHaveAttribute('data-theme', t0 ?? '');
  await page.click('#universal-nav-bar .lang-btn[data-lang="en"]');
  await expect(html).toHaveAttribute('lang', 'en');
  await expect(page.locator('#nav-events-btn')).toContainText('Calendar');
  await page.click('#universal-nav-bar .lang-btn[data-lang="ro"]');
  await expect(html).toHaveAttribute('lang', 'ro');
});

test('demo user (role user) has no admin entry points', async ({ page }) => {
  errors = await boot(page); await login(page, 'demo');
  await expect(page.locator('#events-calendar-app')).toBeVisible();
  await expect(page.locator('#nav-admin-btn')).toBeHidden();
  await expect(page.locator('#nav-social-btn')).toBeHidden();
});

test('logout returns to login view', async ({ page }) => {
  errors = await boot(page); await login(page, 'demo_admin');
  await page.click('#nav-logout-btn');
  await expect(page.locator('#direct-login-view')).toBeVisible();
});
