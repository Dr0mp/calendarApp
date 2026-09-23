// Computed-style regression check: renders the app with HTML/JS/CSS from a git ref and with the
// working copy, and compares getComputedStyle() of EVERY element (visible or not) in
// several app states and both themes. Catches cascade changes the screenshots can't see
// (closed dialogs, hidden panels, other breakpoints).
// Usage: node tools/audit/css-diff.mjs [gitRef=HEAD]   (test server must run on :3100)
import { execSync } from 'child_process'; import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ref = process.argv[2] || 'HEAD';

// The properties that decide what a user sees (layout, box, colour, type, effects).
const PROPS = ['display','position','top','right','bottom','left','z-index','float','width','height','min-width','max-width','min-height','max-height',
  'margin-top','margin-right','margin-bottom','margin-left','padding-top','padding-right','padding-bottom','padding-left',
  'border-top-width','border-right-width','border-bottom-width','border-left-width','border-top-style','border-left-style',
  'border-top-color','border-right-color','border-bottom-color','border-left-color','border-top-left-radius','border-bottom-right-radius',
  'color','background-color','background-image','opacity','visibility','box-shadow','outline-color','outline-width','outline-style',
  'font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-transform','text-decoration-line','white-space','text-overflow',
  'flex-direction','flex-wrap','justify-content','align-items','align-self','flex-grow','flex-shrink','flex-basis','gap','row-gap','column-gap',
  'grid-template-columns','grid-template-rows','grid-column-start','grid-row-start','overflow-x','overflow-y','transform','filter','backdrop-filter','cursor','object-fit','list-style-type','vertical-align','font-variant-numeric','-webkit-line-clamp'];

const STATES = [
  ['social-year', async p => p.click('#view-year-btn')],
  ['social-month', async p => p.click('#view-month-btn')],
  ['social-feed', async p => p.click('#view-feed-btn')],
  ['events-month', async p => { await p.click('#nav-events-btn'); await p.click('#btn-zoom-monthly'); }],
  ['events-day', async p => { await p.click('#nav-events-btn'); await p.click('#btn-zoom-daily'); }],
  ['events-year', async p => { await p.click('#nav-events-btn'); await p.click('#btn-zoom-yearly'); }],
  ['schedule', async p => p.click('#nav-schedule-btn')],
  ['my-events', async p => p.click('#nav-my-events-btn')],
  ['event-detail', async p => { await p.click('#nav-my-events-btn'); await p.locator('.btn-my-event-view').first().click(); }],
  ['admin', async p => { await p.click('#nav-admin-btn'); await p.click('#admin-cat-all'); }],
  ['post-dialog', async p => { await p.click('#nav-social-btn'); await p.click('#view-month-btn'); await p.click('#open-add-post-btn'); }],
  ['post-detail', async p => { await p.click('#nav-social-btn'); await p.click('#view-month-btn'); await p.locator('.post-card-pill').first().click(); }],
  ['control-panel', async p => { await p.click('#nav-social-btn'); await p.click('#open-control-panel-btn'); }],
  ['notifications', async p => { await p.click('#nav-social-btn'); await p.click('#btn-social-event-notifications'); }],
];

async function snapshot(side, theme, width) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(4000);
  await page.clock.setFixedTime(new Date('2026-09-15T10:00:00+03:00'));
  const freeze = '\n*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}';
  // side = 'old' serves every static file (HTML, JS, CSS) from the git ref; 'new' the working copy.
  await page.route(u => u.hostname === 'localhost' && !u.pathname.startsWith('/api/'), async r => {
    const url = new URL(r.request().url()); let p = url.pathname === '/' ? '/index.html' : url.pathname;
    const type = p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : null;
    if (!type) return r.continue();
    let body;
    try { body = side === 'old' ? execSync(`git show ${ref}:public${p}`, { cwd: ROOT, maxBuffer: 1e8 }).toString() : fs.readFileSync(path.join(ROOT, 'public', p), 'utf8'); }
    catch { return r.fulfill({ status: 404, body: '' }); }
    if (type === 'text/css') body += freeze;
    return r.fulfill({ contentType: type, body });
  });
  await page.route(u => !u.hostname.startsWith('localhost'), r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"/>' }));
  page.on('dialog', d => d.accept());
  await page.addInitScript(t => { if (!sessionStorage.getItem('s')) { localStorage.clear(); localStorage.setItem('cal_suite_theme_v1', t); sessionStorage.setItem('s', 1); } }, theme);
  await page.goto('http://localhost:3100/');
  await page.fill('#direct-login-username', 'demo_admin'); await page.fill('#direct-login-password', 'demo123');
  await page.press('#direct-login-password', 'Enter'); await page.waitForSelector('#universal-nav-bar', { state: 'visible' });
  const out = {};
  for (const [name, go] of STATES) {
    await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
    try { await go(page); } catch (e) { out[name] = { error: e.message.split('\n')[0] }; continue; }
    await page.waitForTimeout(150);
    if (process.env.VERBOSE) console.error(`  ${theme}/${width}/${name}`);
    out[name] = await page.evaluate((PROPS) => {
      const res = {}; let i = 0;
      const pathOf = el => { const parts = []; while (el && el.nodeType === 1 && el !== document.body) { let k = el.tagName.toLowerCase(); if (el.id) { parts.unshift(k + '#' + el.id); break; } const sib = [...el.parentNode.children].filter(c => c.tagName === el.tagName); k += `:${sib.indexOf(el)}`; parts.unshift(k); el = el.parentElement; } return parts.join('>'); };
      for (const el of document.body.querySelectorAll('*')) {
        if (el.closest('svg.ui-icon-sprite')) continue;
        const cs = getComputedStyle(el); const o = {};
        for (const p of PROPS) o[p] = cs.getPropertyValue(p);
        for (const pseudo of ['::before', '::after']) { const ps = getComputedStyle(el, pseudo); if (ps.content && ps.content !== 'none') o[pseudo] = ['content', 'color', 'background-color', 'width', 'height', 'top', 'left', 'font-size', 'border-color', 'opacity', 'display'].map(p => ps.getPropertyValue(p)).join('|'); }
        res[pathOf(el) + '#' + (i++)] = o;
      }
      return res;
    }, PROPS);
  }
  await b.close();
  return out;
}

let total = 0; const summary = {};
for (const [theme, width] of [['dark', 1280], ['light', 1280], ['dark', 390]]) {
  const [a, b] = [await snapshot('old', theme, width), await snapshot('new', theme, width)];
  for (const state of Object.keys(a)) {
    if (a[state].error || b[state].error) { console.log(`${theme}/${width}/${state}: ${a[state].error || b[state].error}`); continue; }
    const ka = Object.keys(a[state]), kb = Object.keys(b[state]);
    if (ka.length !== kb.length) console.log(`${theme}/${width}/${state}: element count ${ka.length} vs ${kb.length}`);
    for (let i = 0; i < Math.min(ka.length, kb.length); i++) {
      const A = a[state][ka[i]], B = b[state][kb[i]];
      for (const p of new Set([...Object.keys(A), ...Object.keys(B)])) {
        if (A[p] !== B[p]) {
          total++; const key = `${p}: ${A[p]} -> ${B[p]}`;
          summary[key] = summary[key] || { n: 0, where: new Set() }; summary[key].n++;
          if (summary[key].where.size < 4) summary[key].where.add(`${theme}/${width}/${state} ${ka[i].replace(/#\d+$/, '').split('>').slice(-3).join('>')}`);
        }
      }
    }
  }
}
const rows = Object.entries(summary).sort((x, y) => y[1].n - x[1].n);
for (const [k, v] of rows.slice(0, 80)) console.log(`${String(v.n).padStart(5)}  ${k}\n        ${[...v.where].join('\n        ')}`);
console.log(`\n${total} computed-style differences (${rows.length} distinct)`);
process.exit(total ? 1 : 0);
