// Step 2 of the data-i18n migration: annotate index.html from i18n-map.json (minus conflicts),
// write the Romanian text into the static markup, and delete the now-redundant simple
// statements from applyLanguage(). Verify afterwards by re-running i18n-map.mjs.
import fs from 'fs'; import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const { TRANSLATIONS } = await import(path.join(ROOT, 'public/src/data/i18n.js'));
const RO = TRANSLATIONS.ro;
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/refactor/i18n-map.json'), 'utf8'));
const conflicts = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/refactor/i18n-conflicts.json'), 'utf8'));
const skip = new Set(conflicts.map(c => `${c.idx}:${c.attr}`));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => esc(s).replace(/"/g, '&quot;');

const usable = map.filter(m => !skip.has(`${m.idx}:${m.attr}`) && (m.attr !== 'text' || m.textOnly) && RO[m.key] !== undefined);
let html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
// apply edits from the end of the file backwards so earlier offsets stay valid
const byEl = new Map(); usable.forEach(m => { if (!byEl.has(m.start)) byEl.set(m.start, []); byEl.get(m.start).push(m); });
for (const start of [...byEl.keys()].sort((a, b) => b - a)) {
  const ms = byEl.get(start);
  const tagEnd = html.indexOf('>', start);
  let tag = html.slice(start, tagEnd + 1);
  const name = tag.match(/^<([a-z0-9-]+)/i)[1];
  let inner = null;
  for (const m of ms) {
    if (m.attr === 'text') {
      tag = tag.replace(new RegExp(`^<${name}`), `<${name} data-i18n="${m.key}"`);
      inner = esc(RO[m.key]);
    } else {
      tag = tag.replace(new RegExp(`^<${name}`), `<${name} data-i18n-${m.attr}="${m.key}"`);
      const re = new RegExp(`\\s${m.attr}="[^"]*"`);
      tag = re.test(tag) ? tag.replace(re, ` ${m.attr}="${escAttr(RO[m.key])}"`) : tag.replace(/\s*\/?>$/, s => ` ${m.attr}="${escAttr(RO[m.key])}"${s.trim() === '/>' ? ' />' : '>'}`);
    }
  }
  if (inner !== null) {
    const close = html.indexOf(`</${name}>`, tagEnd);
    html = html.slice(0, start) + tag + inner + html.slice(close);
  } else {
    html = html.slice(0, start) + tag + html.slice(tagEnd + 1);
  }
}
fs.writeFileSync(path.join(ROOT, 'public/index.html'), html);

// remove redundant statements from applyLanguage
const jsFile = path.join(ROOT, 'public/src/core/i18n.js');
let js = fs.readFileSync(jsFile, 'utf8');
const a = js.indexOf('  applyLanguage(lang, reRenderViews = true) {'); const b = js.indexOf('\n  },', a);
let body = js.slice(a, b);
const covered = { text: new Set(), title: new Set(), placeholder: new Set(), 'aria-label': new Set() };
usable.forEach(m => covered[m.attr].add(m.key));
const conflictKeys = new Set(conflicts.map(c => c.key));
let removed = 0;
body = body.split('\n').filter(line => {
  const keys = [...line.matchAll(/this\.t\("([a-z0-9_]+)"\)/g)].map(x => x[1]);
  if (keys.length !== 1 || conflictKeys.has(keys[0])) return true;
  const k = keys[0];
  const simple = [
    [/^\s*(if \([\w.?\[\]]+\) )?[\w.?\[\]]+\.textContent = this\.t\("[a-z0-9_]+"\);\s*$/, 'text'],
    [/^\s*(if \([\w.?\[\]]+\) )?[\w.?\[\]]+\.title = this\.t\("[a-z0-9_]+"\);\s*$/, 'title'],
    [/^\s*(if \([\w.?\[\]]+\) )?[\w.?\[\]]+\.placeholder = this\.t\("[a-z0-9_]+"\);\s*$/, 'placeholder'],
    [/^\s*(if \([\w.?\[\]]+\) )?[\w.?\[\]]+\.setAttribute\("aria-label", this\.t\("[a-z0-9_]+"\)\);\s*$/, 'aria-label'],
  ];
  for (const [re, attr] of simple) if (re.test(line) && covered[attr].has(k)) { removed++; return false; }
  return true;
}).join('\n');
// drop lookups whose variable is no longer used, then empty if-blocks, repeat until stable
for (let pass = 0; pass < 4; pass++) {
  body = body.split('\n').filter((line, i, all) => {
    const m = line.match(/^\s*const (\w+) = (document\.|this\.dom\.)[^;]*;\s*$/);
    if (!m) return true;
    const rest = all.filter((_, j) => j !== i).join('\n');
    return new RegExp(`\\b${m[1]}\\b`).test(rest);
  }).join('\n');
  body = body.replace(/\n[ \t]*if \([^\n]*\) \{\s*\n[ \t]*\}/g, '');
}
body = body.replace(/\n{3,}/g, '\n\n');
js = js.slice(0, a) + body + js.slice(b);
fs.writeFileSync(jsFile, js);
console.log(`annotated ${usable.length} attributes on ${byEl.size} elements; removed ${removed} statements`);
