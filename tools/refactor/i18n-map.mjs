// Maps which static index.html elements applyLanguage() translates, and with which key.
// Serves an instrumented index.html (every start tag gets data-src-idx), makes t() return
// a marker, re-runs applyLanguage(), and reads the markers back from the DOM.
// Output: tools/refactor/i18n-map.json  [{ idx, start, tag, attr, key, textOnly }]
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Parser } = require('../audit/node_modules/htmlparser2');
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');

// record start-tag positions in source order
const tags = []; const stack = [];
const parser = new Parser({
  onopentag(name) { const t = { idx: tags.length, name, start: parser.startIndex, end: parser.endIndex, children: 0, text: '' }; if (stack.length) stack[stack.length - 1].children++; tags.push(t); stack.push(t); },
  ontext(txt) { if (stack.length) stack[stack.length - 1].text += txt; },
  onclosetag() { const t = stack.pop(); if (t) t.close = parser.startIndex; },
}, { recognizeSelfClosing: true, lowerCaseTags: true });
parser.write(html); parser.end();

let out = '', last = 0;
for (const t of tags) { const insertAt = t.start + 1 + t.name.length; out += html.slice(last, insertAt) + ` data-src-idx="${t.idx}"`; last = insertAt; }
out += html.slice(last);

const base = process.env.BASE || 'http://localhost:3100';
const b = await chromium.launch(); const page = await b.newPage();
await page.route(u => u.pathname === '/' || u.pathname === '/index.html', r => r.fulfill({ contentType: 'text/html', body: out }));
await page.route(u => !u.hostname.startsWith('localhost'), r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"/>' }));
page.on('dialog', d => d.accept());
await page.goto(base + '/');
await page.fill('#direct-login-username', process.env.USER_NAME || 'demo_admin');
await page.fill('#direct-login-password', process.env.USER_PW || 'demo123');
await page.press('#direct-login-password', 'Enter');
await page.waitForSelector('#universal-nav-bar', { state: 'visible' });
await page.waitForTimeout(500);
const marks = await page.evaluate(() => {
  const app = window.calendarApp; const orig = app.t;
  app.t = k => `⟦${k}⟧`;
  try { app.applyLanguage(app.currentLang, false); } finally { app.t = orig; }
  const re = /^⟦([a-z0-9_]+)⟧$/;
  const res = [];
  document.querySelectorAll('[data-src-idx]').forEach(el => {
    const idx = +el.dataset.srcIdx;
    if (el.childNodes.length === 1 && el.firstChild.nodeType === 3) { const m = el.firstChild.nodeValue.match(re); if (m) res.push({ idx, attr: 'text', key: m[1] }); }
    for (const a of ['placeholder', 'title', 'aria-label']) { const v = el.getAttribute(a); const m = v && v.match(re); if (m) res.push({ idx, attr: a, key: m[1] }); }
  });
  app.applyLanguage(app.currentLang, false);
  return res;
});
await b.close();
const result = marks.map(m => { const t = tags[m.idx]; return { ...m, tag: t.name, start: t.start, textOnly: t.children === 0 }; });
fs.writeFileSync(path.join(ROOT, 'tools/refactor/i18n-map.json'), JSON.stringify(result, null, 1));
console.log(`${result.length} translated attributes on ${new Set(result.map(r => r.idx)).size} static elements`);
const byAttr = {}; result.forEach(r => byAttr[r.attr] = (byAttr[r.attr] || 0) + 1); console.log(byAttr);
console.log('non-text-only text targets:', result.filter(r => r.attr === 'text' && !r.textOnly).map(r => r.tag + ':' + r.key).join(' '));
