// Finds static index.html text/placeholder/title that stays identical in RO and EN (i.e. never translated).
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Parser } = require('../audit/node_modules/htmlparser2');
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const tags = []; const stack = [];
const parser = new Parser({
  onopentag(name, attrs) { const t = { idx: tags.length, name, start: parser.startIndex, attrs }; tags.push(t); stack.push(t); },
  onclosetag() { stack.pop(); },
}, { recognizeSelfClosing: true, lowerCaseTags: true });
parser.write(html); parser.end();
let out = '', last = 0;
for (const t of tags) { const at = t.start + 1 + t.name.length; out += html.slice(last, at) + ` data-src-idx="${t.idx}"`; last = at; }
out += html.slice(last);

const b = await chromium.launch();
async function snapshot(lang) {
  const ctx = await b.newContext(); const page = await ctx.newPage();
  await page.addInitScript(l => { if (!sessionStorage.getItem('s')) { localStorage.clear(); localStorage.setItem('cal_suite_lang_v1', l); sessionStorage.setItem('s', 1); } }, lang);
  await page.route(u => u.pathname === '/' , r => r.fulfill({ contentType: 'text/html', body: out }));
  await page.route(u => !u.hostname.startsWith('localhost'), r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"/>' }));
  page.on('dialog', d => d.accept());
  await page.goto('http://localhost:3100/');
  await page.fill('#direct-login-username', 'demo_admin'); await page.fill('#direct-login-password', 'demo123');
  await page.press('#direct-login-password', 'Enter'); await page.waitForSelector('#universal-nav-bar', { state: 'visible' });
  await page.waitForTimeout(400);
  const snap = await page.evaluate(() => {
    const r = {};
    document.querySelectorAll('[data-src-idx]').forEach(el => {
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue.trim()).filter(Boolean).join(' ');
      r[el.dataset.srcIdx] = { text: own, placeholder: el.getAttribute('placeholder'), title: el.getAttribute('title'), 'aria-label': el.getAttribute('aria-label') };
    });
    return r;
  });
  await ctx.close(); return snap;
}
const ro = await snapshot('ro'), en = await snapshot('en');
await b.close();
const res = [];
const skipTags = new Set(['script', 'style', 'svg', 'symbol', 'path', 'code', 'polyline', 'circle', 'line', 'polygon']);
for (const t of tags) {
  if (skipTags.has(t.name)) continue;
  const a = ro[t.idx], e = en[t.idx]; if (!a || !e) continue;
  for (const k of ['text', 'placeholder', 'title', 'aria-label']) {
    const v = a[k];
    if (v && v === e[k] && /[A-Za-zĂÂÎȘȚăâîșț]{3}/.test(v)) res.push({ idx: t.idx, start: t.start, tag: t.name, id: t.attrs.id, attr: k, value: v });
  }
}
fs.writeFileSync(path.join(ROOT, 'tools/refactor/i18n-untranslated.json'), JSON.stringify(res, null, 1));
console.log(res.length); res.forEach(r => console.log(`${r.idx}\t${r.tag}${r.id ? '#' + r.id : ''}\t[${r.attr}]\t${r.value.slice(0, 90)}`));
