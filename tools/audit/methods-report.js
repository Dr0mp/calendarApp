// Lists app methods (class members and mixin object methods), unreferenced ones, and the largest.
const fs = require('fs'), path = require('path'), acorn = require('acorn'), walk = require('acorn-walk');
const SF = require('./src-files.cjs');
const D = (p => fs.existsSync(p + '/public/index.html') ? p + '/public/' : p + '/')(path.resolve(process.argv[2] || '.'));
const html = fs.readFileSync(D + 'index.html', 'utf8');
const methods = [];
for (const f of SF.appFiles(D)) {
  const src = fs.readFileSync(f, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  walk.full(ast, n => {
    if (n.type === 'MethodDefinition' && n.key.name !== 'constructor') methods.push({ k: n.key.name, f, l: n.loc.start.line, len: n.loc.end.line - n.loc.start.line + 1 });
    if (n.type === 'Property' && n.method) methods.push({ k: n.key.name, f, l: n.loc.start.line, len: n.loc.end.line - n.loc.start.line + 1 });
  });
}
const all = SF.readApp(D);
const ast = acorn.parse(all, { ecmaVersion: 'latest', sourceType: 'module' });
const refs = Object.create(null);
walk.full(ast, n => { if (n.type === 'MemberExpression' && !n.computed && n.property.name) refs[n.property.name] = (refs[n.property.name] || 0) + 1; });
const strs = new Set((all.match(/['"`][A-Za-z_]\w*['"`]/g) || []).map(s => s.slice(1, -1)));
const rel = f => path.relative(D, f);
const counts = {}; methods.forEach(m => counts[m.k] = (counts[m.k] || 0) + 1);
console.log('METHODS', methods.length, 'in', SF.appFiles(D).length, 'files');
console.log('  DUPLICATE NAMES:', Object.entries(counts).filter(([, v]) => v > 1).map(([k]) => k).join(' '));
console.log('  UNREFERENCED:', methods.filter(m => !refs[m.k] && !strs.has(m.k) && !html.includes(m.k)).map(m => `${m.k}@${rel(m.f)}:${m.l}`).join('  '));
console.log('  LARGEST:', methods.sort((a, b) => b.len - a.len).slice(0, 15).map(m => `${m.k}:${m.len}`).join('  '));
