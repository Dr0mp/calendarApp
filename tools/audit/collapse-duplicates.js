// Collapses rules that repeat the exact same selector list in the same @media context into the
// last occurrence. Conservative: a declaration is moved later only if no rule in between (any
// selector of equal specificity) sets the same or a related property; otherwise it stays put.
// Declarations that a later same-selector declaration already overrides are dropped.
// Usage: node tools/audit/collapse-duplicates.js [--dry]
const fs = require('fs'), path = require('path');
const postcss = require('postcss'), sp = require('postcss-selector-parser');
const file = path.resolve(__dirname, '../../public/styles.css');
const root = postcss.parse(fs.readFileSync(file, 'utf8'));

const ctx = r => { const a = []; let p = r.parent; while (p && p.type !== 'root') { if (p.type === 'atrule') a.push(`@${p.name} ${p.params}`); p = p.parent; } return a.join(' '); };
const norm = sel => sel.split(',').map(s => s.replace(/\s+/g, ' ').trim()).sort().join(', ');
function specificity(sel) {
  let a = 0, b = 0, c = 0;
  sp(x => x.walk(n => {
    if (n.type === 'id') a++;
    else if (n.type === 'class' || n.type === 'attribute' || (n.type === 'pseudo' && !n.value.startsWith('::') && !/^:(not|is|where|has)$/.test(n.value))) b++;
    else if (n.type === 'tag' || (n.type === 'pseudo' && n.value.startsWith('::'))) c++;
  })).processSync(sel);
  return `${a},${b},${c}`;
}
const base = p => p.replace(/^-(webkit|moz|ms)-/, '');
const related = (p, q) => { p = base(p); q = base(q); return p === q || p.startsWith(q + '-') || q.startsWith(p + '-') || (/^(row|column)-gap$/.test(p) && q === 'gap') || (/^(row|column)-gap$/.test(q) && p === 'gap') || (p === 'inset' && /^(top|right|bottom|left)$/.test(q)) || (q === 'inset' && /^(top|right|bottom|left)$/.test(p)); };

// Which classes can sit on the same element? Collected from class="" strings in HTML and JS
// templates; classes toggled via classList can combine with anything.
const pub = path.resolve(__dirname, '../../public');
const walkFiles = d => fs.readdirSync(d).flatMap(f => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? walkFiles(p) : [p]; });
const srcText = walkFiles(pub).filter(f => /\.(html|js)$/.test(f) && !f.includes(`${path.sep}data${path.sep}`)).map(f => fs.readFileSync(f, 'utf8')).join('\n');
const coSets = [...srcText.matchAll(/class(?:Name)?\s*=\s*\\?["'`]([^"'`]*)/g)].map(m => new Set(m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean)));
const toggled = new Set([...srcText.matchAll(/classList\.(?:add|toggle|replace)\(([^)]*)\)/g)].flatMap(m => (m[1].match(/["'`]([\w-]+)["'`]/g) || []).map(x => x.slice(1, -1))));
[...srcText.matchAll(/\$\{[^}]*\?\s*["']([\w-]+)["']\s*:\s*["']([\w-]*)["']\s*\}/g)].forEach(m => { toggled.add(m[1]); if (m[2]) toggled.add(m[2]); });
function subjectClasses(sel) {
  const out = new Set();
  sp(x => x.each(s => { const nodes = []; s.walk(n => { if (n.type === 'combinator') nodes.length = 0; else if (n.parent === s) nodes.push(n); }); nodes.filter(n => n.type === 'class').forEach(n => out.add(n.value)); })).processSync(sel);
  return out;
}
function mayShareElement(selA, selB) {
  const A = subjectClasses(selA), B = subjectClasses(selB);
  if (!A.size || !B.size) return true;
  for (const a of A) for (const b of B) {
    if (a === b || toggled.has(a) || toggled.has(b)) return true;
    if (coSets.some(set => set.has(a) && set.has(b))) return true;
  }
  return false;
}

const rules = [];
root.walkRules(r => { if (r.parent.type === 'atrule' && /keyframes/.test(r.parent.name)) return; rules.push(r); });
rules.forEach((r, i) => { r._i = i; r._specs = new Set(r.selectors.map(specificity)); });
const groups = new Map();
for (const r of rules) { const k = ctx(r) + '|' + norm(r.selector); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }

let dropped = 0, moved = 0, kept = 0, removedRules = 0, collapsed = 0;
const report = [];
for (const [k, list] of groups) {
  if (list.length < 2) continue;
  collapsed++;
  const target = list[list.length - 1];
  const specs = target._specs;
  const decls = list.flatMap(r => r.nodes.filter(n => n.type === 'decl').map(d => ({ d, r })));
  const toMove = [];
  decls.forEach(({ d, r }, idx) => {
    if (r === target) return;
    const imp = !!d.important;
    const superseded = decls.slice(idx + 1).some(x => x.d.prop === d.prop && (!!x.d.important >= imp));
    if (superseded) { d.remove(); dropped++; return; }
    // conflict check with rules between r and target
    const between = rules.slice(r._i + 1, target._i).filter(x => !list.includes(x));
    const conflict = between.some(x => x.nodes.some(n => n.type === 'decl' && related(n.prop, d.prop)) &&
      x.selectors.some(bs => specs.has(specificity(bs)) && target.selectors.some(ts => mayShareElement(ts, bs))));
    if (conflict) { kept++; report.push(`keep  ${k.slice(0, 70)} :: ${d.prop}`); return; }
    toMove.push(d);
  });
  // insert moved declarations at the top of the target, preserving their original order
  const first = target.first;
  for (const d of toMove) { const clone = d.clone(); if (first) target.insertBefore(first, clone); else target.append(clone); d.remove(); moved++; }
  for (const r of list) if (r !== target && !r.nodes.some(n => n.type === 'decl')) {
    // keep comments that sat inside the rule? drop the empty rule entirely
    r.remove(); removedRules++;
  }
}
root.walkAtRules(a => { if (a.nodes && a.nodes.length === 0) a.remove(); });
console.log(report.join('\n'));
console.log(`groups ${collapsed}; dropped ${dropped} overridden decls; moved ${moved}; kept in place ${kept}; removed ${removedRules} rules`);
if (!process.argv.includes('--dry')) fs.writeFileSync(file, root.toResult().css);
