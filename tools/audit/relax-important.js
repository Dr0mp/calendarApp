// Removes !important where static analysis says it is not needed: no JS inline style for that
// property, and no other rule (that could hit the same element) with higher specificity, or
// equal specificity later in the file, declares the same/related property.
// Verify with css-diff.mjs afterwards. Usage: node tools/audit/relax-important.js [--dry]
const fs = require('fs'), path = require('path'), postcss = require('postcss'), sp = require('postcss-selector-parser');
const pub = path.resolve(__dirname, '../../public'); const file = path.join(pub, 'styles.css');
const root = postcss.parse(fs.readFileSync(file, 'utf8'));
const walk = d => fs.readdirSync(d).flatMap(f => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? walk(p) : [p]; });
const js = walk(pub).filter(f => /\.(js|html)$/.test(f) && !f.includes('/data/')).map(f => fs.readFileSync(f, 'utf8')).join('\n');
const camel = p => p.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const inlineProps = new Set();
for (const m of js.matchAll(/\.style\.([a-zA-Z]+)\s*=/g)) inlineProps.add(m[1]);
for (const m of js.matchAll(/style="([^"]*)"/g)) for (const d of m[1].split(';')) { const p = d.split(':')[0].trim(); if (p) inlineProps.add(camel(p)); }
for (const m of js.matchAll(/setProperty\(\s*["'`]([\w-]+)/g)) inlineProps.add(camel(m[1]));
const base = p => p.replace(/^-(webkit|moz|ms)-/, '');
const related = (p, q) => { p = base(p); q = base(q); return p === q || p.startsWith(q + '-') || q.startsWith(p + '-'); };
const spec = sel => { let a = 0, b = 0, c = 0; sp(x => x.walk(n => { if (n.type === 'id') a++; else if (n.type === 'class' || n.type === 'attribute' || (n.type === 'pseudo' && !n.value.startsWith('::') && !/^:(not|is|where|has)$/.test(n.value))) b++; else if (n.type === 'tag' || (n.type === 'pseudo' && n.value.startsWith('::'))) c++; })).processSync(sel); return [a, b, c]; };
const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
const subj = sel => { const out = new Set(); sp(x => x.each(s => { const nodes = []; s.walk(n => { if (n.type === 'combinator') nodes.length = 0; else if (n.parent === s) nodes.push(n); }); nodes.forEach(n => { if (n.type === 'class') out.add('.' + n.value); if (n.type === 'id') out.add('#' + n.value); if (n.type === 'tag') out.add(n.value); }); })).processSync(sel); return out; };
const coSets = [...js.matchAll(/class(?:Name)?\s*=\s*\\?["'`]([^"'`]*)/g)].map(m => new Set(m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean).map(c => '.' + c)));
const toggled = new Set([...js.matchAll(/classList\.(?:add|toggle|replace)\(([^)]*)\)/g)].flatMap(m => (m[1].match(/["'`]([\w-]+)["'`]/g) || []).map(x => '.' + x.slice(1, -1))));
const share = (A, B) => { const ca = [...A].filter(x => x[0] === '.'), cb = [...B].filter(x => x[0] === '.'); if (!ca.length || !cb.length) return true; for (const a of ca) for (const b of cb) { if (a === b || toggled.has(a) || toggled.has(b)) return true; if (coSets.some(s => s.has(a) && s.has(b))) return true; } return false; };
const rules = []; root.walkRules(r => { if (!(r.parent.type === 'atrule' && /keyframes/.test(r.parent.name))) rules.push(r); });
let relaxed = 0, kept = 0; const log = [];
rules.forEach((r, i) => {
  for (const d of r.nodes.filter(x => x.type === 'decl' && x.important)) {
    if (r.selector === '[hidden]') continue;
    let reason = null;
    if ([...inlineProps].some(p => related(camel(d.prop), p) || related(d.prop, p.replace(/[A-Z]/g, m => '-' + m.toLowerCase())))) reason = 'inline style in JS';
    if (!reason) for (const s of r.selectors) {
      const ms = spec(s), A = subj(s);
      for (const [j, x] of rules.entries()) {
        if (x === r || !x.nodes.some(y => y.type === 'decl' && related(y.prop, d.prop))) continue;
        for (const t of x.selectors) {
          const c = cmp(spec(t), ms);
          if ((c > 0 || (c === 0 && j > i)) && share(A, subj(t))) { reason = `competes with ${t.replace(/\s+/g, ' ')}`; break; }
        }
        if (reason) break;
      }
      if (reason) break;
    }
    if (reason) { kept++; log.push(`keep   ${r.selector.replace(/\s+/g, ' ').slice(0, 60)} :: ${d.prop}  (${reason.slice(0, 60)})`); }
    else { d.important = false; relaxed++; log.push(`relax  ${r.selector.replace(/\s+/g, ' ').slice(0, 60)} :: ${d.prop}`); }
  }
});
console.log(log.join('\n')); console.log(`relaxed ${relaxed}, kept ${kept}`);
if (!process.argv.includes('--dry')) fs.writeFileSync(file, root.toResult().css);
