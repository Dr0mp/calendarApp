// Locates the app sources for the audit tools, before (single app.js) and after the module split (src/**).
const fs = require('fs'), path = require('path');
const walk = d => fs.readdirSync(d).flatMap(f => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? walk(p) : [p]; });
function appFiles(D) {
  if (fs.existsSync(path.join(D, 'app.js'))) return [path.join(D, 'app.js')];
  return walk(path.join(D, 'src')).filter(f => f.endsWith('.js') && !f.includes(`${path.sep}data${path.sep}`)).sort();
}
const find = (D, name) => [path.join(D, name), path.join(D, 'src', 'data', name)].find(p => fs.existsSync(p));
module.exports = {
  appFiles,
  // import lines are dropped so the concatenation parses as one module (bindings repeat across files)
  readApp: D => appFiles(D).map(f => fs.readFileSync(f, 'utf8').replace(/^import .*;\s*$/gm, '')).join('\n'),
  i18nPath: D => find(D, 'i18n.js'),
  seedPath: D => find(D, 'seed-data.js'),
};
