// Phone layout (≤640px): no sideways scrolling anywhere, bottom tab bar, "More" sheet,
// tap-a-day navigation, tables as cards, dialogs that fit the screen.
import { test, expect } from '@playwright/test';
import { boot, login } from './helpers.js';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function expectNoSidewaysScroll(page, where) {
  const { sw, vw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
  expect(sw, `${where}: page is ${sw}px wide on a ${vw}px screen`).toBeLessThanOrEqual(vw);
}

const ADMIN_STATES = [
  ['social year', async p => { await p.click('#nav-social-btn'); await p.click('#view-year-btn'); }],
  ['social month', async p => { await p.click('#nav-social-btn'); await p.click('#view-month-btn'); }],
  ['social feed', async p => { await p.click('#nav-social-btn'); await p.click('#view-feed-btn'); }],
  ['events year', async p => { await p.click('#nav-events-btn'); await p.click('#btn-zoom-yearly'); }],
  ['events month', async p => { await p.click('#nav-events-btn'); await p.click('#btn-zoom-monthly'); }],
  ['events day', async p => { await p.click('#nav-events-btn'); await p.click('#btn-zoom-daily'); }],
  ['schedule', async p => { await p.click('#nav-schedule-btn'); }],
  ['my events', async p => { await p.click('#nav-my-events-btn'); }],
  ...['all', 'users', 'events', 'spaces', 'rooms', 'storage'].map(c => [`admin ${c}`, async p => { await p.click('#nav-admin-btn'); await p.click(`#admin-cat-${c}`); }]),
];

test('no screen scrolls sideways; the tab bar stays at the bottom', async ({ page }) => {
  await boot(page); await login(page, 'demo_admin');
  for (const [name, go] of ADMIN_STATES) {
    await go(page);
    await expectNoSidewaysScroll(page, name);
    const bar = await page.locator('.nav-menu-tabs').boundingBox();
    expect(Math.round(bar.y + bar.height), `${name}: tab bar bottom`).toBe(844);
  }
});

test('dialogs fit on the screen', async ({ page }) => {
  await boot(page); await login(page, 'demo_admin');
  const dialogs = [
    ['#open-add-post-btn', '#post-dialog'],
    ['#btn-social-event-notifications', '#social-notifications-modal'],
    ['#open-control-panel-btn', '#control-panel-dialog'],
  ];
  await page.click('#nav-social-btn');
  for (const [opener, dialog] of dialogs) {
    await page.click(opener);
    const box = await page.locator(dialog).boundingBox();
    expect(box.x, dialog).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, dialog).toBeLessThanOrEqual(390);
    await page.keyboard.press('Escape');
  }
});

test('"More" sheet: language, theme and sign-out', async ({ page }) => {
  await boot(page); await login(page, 'demo');
  // Desktop-only controls are hidden in the top bar
  await expect(page.locator('#nav-logout-btn')).toBeHidden();
  await page.click('#nav-more-btn');
  const sheet = page.locator('#nav-more-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('@demo');
  await sheet.locator('[data-lang="en"]').click();
  await expect(page.locator('#nav-events-btn .nav-tab-short')).toHaveText('Calendar');
  await expect(page.locator('#nav-my-events-btn .nav-tab-short')).toHaveText('Mine');
  await sheet.locator('[data-theme-toggle]').click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  await page.click('#more-logout-btn');
  await expect(page.locator('#direct-login-view')).toBeVisible();
});

test('month views: tap a day to open it', async ({ page }) => {
  await boot(page); await login(page, 'demo_admin');
  // Events: a day with events opens that day's timeline (one day on phones)
  await page.click('#nav-events-btn'); await page.click('#btn-zoom-monthly');
  await page.locator('#events-days-grid .calendar-day-cell:has(.event-card-pill)').first().click();
  await expect(page.locator('#btn-zoom-daily')).toHaveClass(/is-active/);
  await expect(page.locator('.timeline-day-header-cell')).toHaveCount(1);
  // Previous/next move by one day on phones
  const label = await page.locator('#events-current-month-label').textContent();
  await page.click('#events-next-month-btn');
  await expect(page.locator('#events-current-month-label')).not.toHaveText(label);
  await expect(page.locator('.timeline-day-header-cell')).toHaveCount(1);

  // Social: a day with posts opens the feed at that date
  await page.click('#nav-social-btn'); await page.click('#view-month-btn');
  const cell = page.locator('#calendar-days-grid .calendar-day-cell:has(.post-card-pill)').first();
  await cell.click();
  await expect(page.locator('#view-feed-btn')).toHaveClass(/is-active/);
  await expect(page.locator('.feed-day-group').first()).toBeVisible();
});

test('admin tables become labelled cards', async ({ page }) => {
  await boot(page); await login(page, 'demo_admin');
  await page.click('#nav-admin-btn'); await page.click('#admin-cat-spaces');
  const table = page.locator('#admin-spaces-section table');
  await expect(table.locator('thead')).toBeHidden();
  const firstCell = table.locator('tbody tr').first().locator('td').first();
  await expect(firstCell).toHaveAttribute('data-label', 'Spațiu / Sală');
});
