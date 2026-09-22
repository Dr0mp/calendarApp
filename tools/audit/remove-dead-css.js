// Removes CSS rules/selectors that reference a class which appears nowhere in the app's HTML/JS.
// Usage: node tools/audit/remove-dead-css.js [--dry]
const fs = require('fs'), path = require('path');
const postcss = require('postcss'), sp = require('postcss-selector-parser');
const root = path.resolve(__dirname, '../../public');
const cssFile = path.join(root, 'styles.css');
const src = fs.readdirSync(root).filter(f => /\.(js|html)$/.test(f)).map(f => fs.readFileSync(path.join(root, f), 'utf8'))
  .concat(fs.existsSync(path.join(root, 'src')) ? walk(path.join(root, 'src')).map(f => fs.readFileSync(f, 'utf8')) : []).join('\n');
function walk(d) { return fs.readdirSync(d).flatMap(f => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? walk(p) : [p]; }); }
const tokens = new Set(src.match(/[A-Za-z_][\w-]*/g));
// Classes composed at runtime (e.g. `label-${s.type}`)
['label-hour', 'label-next-day', 'label-next-week', 'toast--info', 'toast--success', 'toast--warning', 'toast--danger'].forEach(c => tokens.add(c));

const isDead = sel => { let dead = false; sp(x => x.walkClasses(n => { if (!tokens.has(n.value)) dead = true; })).processSync(sel); return dead; };
const ast = postcss.parse(fs.readFileSync(cssFile, 'utf8'));
let removedRules = 0, trimmed = 0; const log = [];
ast.walkRules(r => {
  if (r.parent.type === 'atrule' && /keyframes/.test(r.parent.name)) return;
  const keep = r.selectors.filter(s => !isDead(s));
  if (keep.length === 0) { log.push(`- ${r.selector.replace(/\s+/g, ' ')}`); r.remove(); removedRules++; }
  else if (keep.length < r.selectors.length) { log.push(`~ ${r.selectors.filter(isDead).join(', ')}`); r.selectors = keep; trimmed++; }
});
// Drop now-empty at-rules
ast.walkAtRules(a => { if (a.nodes && a.nodes.length === 0) a.remove(); });
console.log(log.join('\n'));
console.log(`removed ${removedRules} rules, trimmed ${trimmed} selector lists`);
if (!process.argv.includes('--dry')) fs.writeFileSync(cssFile, ast.toResult().css);
