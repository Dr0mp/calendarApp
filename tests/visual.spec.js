import { test, expect } from '@playwright/test';
import { boot, login, settle } from './helpers.js';

// Each state: [name, async setup(page)] — run after login as demo_admin.
const STATES = [
  ['social-year', async p => { await p.click('#view-year-btn'); }],
  ['social-month', async p => { await p.click('#view-month-btn'); }],
  ['social-feed', async p => { await p.click('#view-feed-btn'); }],
  ['events-yearly', async p => { await p.click('#nav-events-btn'); await p.click('#btn-zoom-yearly'); }],
  ['events-monthly', async p => { await p.click('#nav-events-btn'); await p.click('#btn-zoom-monthly'); }],
  ['events-daily', async p => { await p.click('#nav-events-btn'); await p.click('#btn-zoom-daily'); }],
  ['schedule-step1', async p => { await p.click('#nav-schedule-btn'); }],
  ['my-events', async p => { await p.click('#nav-my-events-btn'); }],
  ['admin-users', async p => { await p.click('#nav-admin-btn'); await p.click('#admin-cat-users'); }],
  ['admin-storage', async p => { await p.click('#nav-admin-btn'); await p.click('#admin-cat-storage'); }],
  ['notifications', async p => { await p.click('#btn-social-event-notifications'); }],
];

async function shoot(page, name, fullPage = true) {
  await settle(page);
  await expect(page).toHaveScreenshot(name + '.png', { fullPage });
}

for (const theme of ['dark', 'light']) {
  test.describe(`desktop ${theme}`, () => {
    test(`login ${theme}`, async ({ page }) => {
      await boot(page, { theme });
      await shoot(page, `d-${theme}-login`);
    });
    for (const [name, setup] of STATES) {
      test(`${name} ${theme}`, async ({ page }) => {
        await boot(page, { theme }); await login(page, 'demo_admin');
        await setup(page);
        await shoot(page, `d-${theme}-${name}`, name !== 'notifications');
      });
    }
  });
}

test.describe('desktop english', () => {
  for (const [name, setup] of STATES.filter(([n]) => ['social-month', 'events-monthly', 'schedule-step1', 'admin-users'].includes(n))) {
    test(`${name} en`, async ({ page }) => {
      await boot(page, { theme: 'dark', lang: 'en' }); await login(page, 'demo_admin');
      await setup(page);
      await shoot(page, `d-dark-en-${name}`);
    });
  }
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const [name, setup] of STATES.filter(([n]) => ['social-month', 'events-monthly', 'events-daily', 'schedule-step1', 'my-events', 'admin-users'].includes(n))) {
    test(`${name} mobile`, async ({ page }) => {
      await boot(page, { theme: 'dark' }); await login(page, 'demo_admin');
      await setup(page);
      await shoot(page, `m-dark-${name}`);
    });
  }
});
