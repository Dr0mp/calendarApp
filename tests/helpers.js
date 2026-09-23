export const FIXED_NOW = new Date('2026-09-15T10:00:00+03:00');

export async function boot(page, { theme = 'dark', lang = 'ro', now = FIXED_NOW, storage = {} } = {}) {
  await page.clock.setFixedTime(now);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
    if (m.type() === 'warning' && m.text().includes('[i18n]')) errors.push('i18n: ' + m.text());
  });
  page.on('dialog', d => d.accept());
  // Deterministic, offline: stub every external image (Unsplash samples, Google favicons).
  const svg = (w, h, fill) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${fill}"/></svg>`;
  await page.route(u => !u.hostname.startsWith('localhost'), route => {
    const url = route.request().url();
    const m = url.match(/[?&]w=(\d+).*?[?&]h=(\d+)/);
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: m ? svg(m[1], m[2], '#6b7280') : svg(64, 64, '#9ca3af') });
  });
  await page.addInitScript(([theme, lang, storage]) => {
    if (!sessionStorage.getItem('__seeded')) {
      localStorage.clear();
      localStorage.setItem('cal_suite_theme_v1', theme);
      localStorage.setItem('cal_suite_lang_v1', lang);
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
      sessionStorage.setItem('__seeded', '1');
    }
  }, [theme, lang, storage]);
  // Every test starts from the sample content.
  await page.request.post('/api/test/reset-data');
  await page.goto('/');
  return errors;
}

const cookieCache = new Map(); // username -> auth cookie (avoids the 20-logins/15-min rate limit)

export async function login(page, username, password = 'demo123', { ui = false } = {}) {
  const ctx = page.context();
  let viaCookie = false;
  if (!ui && cookieCache.has(username)) {
    await ctx.addCookies([cookieCache.get(username)]);
    await page.reload();
    // A cached cookie may have been revoked meanwhile (logout bumps the token version).
    viaCookie = await page.waitForSelector('#universal-nav-bar', { state: 'visible', timeout: 3000 }).then(() => true, () => false);
  }
  if (!viaCookie) {
    await page.fill('#direct-login-username', username);
    await page.fill('#direct-login-password', password);
    await page.press('#direct-login-password', 'Enter');
  }
  await page.waitForSelector('#universal-nav-bar', { state: 'visible' });
  await page.waitForTimeout(300);
  const c = (await ctx.cookies()).find(c => c.name === 'auth_token');
  if (c) cookieCache.set(username, c);
}

export async function settle(page) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(500);
}

// Password of the non-demo admin in the test users store (see tests/start-test-server.mjs).
export const ADMIN_PW = 'Admin-Test-Password-1';
