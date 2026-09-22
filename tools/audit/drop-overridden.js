// Removes declarations that can never win: every selector of the rule is re-declared later,
// in the same @media context, with the same property and equal-or-stronger importance.
// (Always safe: later + same selector + same specificity = the later one wins.)
const fs = require('fs'), path = require('path'), postcss = require('postcss');
const file = path.resolve(__dirname, '../../public/styles.css');
const root = postcss.parse(fs.readFileSync(file, 'utf8'));
const ctx = r => { const a = []; let p = r.parent; while (p && p.type !== 'root') { if (p.type === 'atrule') a.push(`@${p.name} ${p.params}`); p = p.parent; } return a.join(' '); };
const n = s => s.replace(/\s+/g, ' ').trim();
const rules = []; root.walkRules(r => { if (!(r.parent.type === 'atrule' && /keyframes/.test(r.parent.name))) rules.push(r); });
let dropped = 0, emptied = 0;
rules.forEach((r, i) => {
  const c = ctx(r); const sels = r.selectors.map(n);
  const later = rules.slice(i + 1).filter(x => ctx(x) === c);
  for (const d of r.nodes.filter(x => x.type === 'decl')) {
    const imp = !!d.important;
    const beaten = sels.every(s => later.some(x => x.selectors.map(n).includes(s) && x.nodes.some(y => y.type === 'decl' && y.prop === d.prop && (!!y.important >= imp))));
    if (beaten) { d.remove(); dropped++; }
  }
  if (!r.nodes.some(x => x.type === 'decl')) { r.remove(); emptied++; }
});
root.walkAtRules(a => { if (a.nodes && a.nodes.length === 0) a.remove(); });
console.log(`dropped ${dropped} never-winning declarations; removed ${emptied} emptied rules`);
if (!process.argv.includes('--dry')) fs.writeFileSync(file, root.toResult().css);
