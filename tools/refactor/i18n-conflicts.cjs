// Elements from i18n-map.json whose same attribute is ALSO written by code other than a plain this.t("<same key>").
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const map = require('./i18n-map.json');
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const walk = d => fs.readdirSync(d).flatMap(f => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(path.join(ROOT, 'public/src')).filter(f => f.endsWith('.js') && !f.includes('/data/'));
const refs = fs.readFileSync(path.join(ROOT, 'public/src/core/dom-refs.js'), 'utf8');
const lines = files.flatMap(f => fs.readFileSync(f, 'utf8').split('\n').map((l, i) => ({ f: path.relative(ROOT, f), n: i + 1, l })));
const conflicts = new Map();
for (const m of map) {
  const tagSrc = html.slice(m.start, html.indexOf('>', m.start) + 1);
  const id = (tagSrc.match(/\sid="([^"]+)"/) || [])[1];
  if (!id) continue;
  const names = [...refs.matchAll(new RegExp(`(\\w+):\\s*document\\.getElementById\\("${id}"\\)`, 'g'))].map(x => x[1]);
  const localVars = lines.filter(x => x.l.includes(`getElementById("${id}")`) && /const (\w+) =/.test(x.l)).map(x => x.l.match(/const (\w+) =/)[1]);
  const prop = { text: '(textContent|innerHTML|innerText)', title: 'title', placeholder: 'placeholder', 'aria-label': 'aria' }[m.attr];
  const targets = [...names.map(n => `dom\\.${n}`), ...localVars.map(v => `\\b${v}`)];
  for (const x of lines) {
    for (const t of targets) {
      const re = m.attr === 'aria-label' ? new RegExp(`${t}\\??\\.setAttribute\\("aria-label"`) : new RegExp(`${t}\\??\\.${prop}\\s*=[^=]`);
      if (re.test(x.l) && !x.l.includes(`this.t("${m.key}")`)) {
        const k = `${m.idx}:${m.attr}`; if (!conflicts.has(k)) conflicts.set(k, { id, ...m, lines: [] });
        conflicts.get(k).lines.push(`${x.f}:${x.n} ${x.l.trim().slice(0, 120)}`);
      }
    }
  }
}
fs.writeFileSync(path.join(__dirname, 'i18n-conflicts.json'), JSON.stringify([...conflicts.values()], null, 1));
for (const c of conflicts.values()) console.log(`${c.id} [${c.attr}] ${c.key}\n    ${c.lines.join('\n    ')}`);
console.log(conflicts.size, 'conflicting element attributes');
