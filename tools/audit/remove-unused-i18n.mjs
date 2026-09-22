// Removes translation keys that no source file references. Usage: node tools/audit/remove-unused-i18n.mjs [--dry]
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
const walk = d => fs.readdirSync(d).flatMap(f => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? walk(p) : [p]; });
const i18nFile = walk(root).find(f => f.endsWith(path.join('data', 'i18n.js'))) || walk(root).find(f => f.endsWith('i18n.js'));
const sources = walk(root).filter(f => /\.(js|html)$/.test(f) && f !== i18nFile).map(f => fs.readFileSync(f, 'utf8')).join('\n');
const { TRANSLATIONS } = await import(pathToFileURL(i18nFile) + '?t=' + Date.now());
const keys = Object.keys(TRANSLATIONS.ro);
const used = new Set(keys.filter(k => new RegExp(`["'\`]${k}["'\`]`).test(sources)));
// Keys built at runtime: role_${role}, post_status_${status}, plural forms <key>_one (see tn()).
const DYNAMIC = [/^role_/, /^post_status_/, /_one$/];
const unused = keys.filter(k => !used.has(k) && !DYNAMIC.some(re => re.test(k)));
let text = fs.readFileSync(i18nFile, 'utf8');
let removed = 0;
for (const k of unused) {
  const re = new RegExp(`^[ \\t]+${k}: (?:"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`[^\`]*\`),?[ \\t]*\\r?\\n`, 'gm');
  const before = text.length; text = text.replace(re, ''); if (text.length !== before) removed++;
  else console.warn('could not remove (multi-line value?):', k);
}
// Collapse section comments left with no keys under them
text = text.replace(/(\n[ \t]*\/\/[^\n]*\n)(?=[ \t]*(\/\/|\n|\}))/g, '\n').replace(/\n{3,}/g, '\n\n');
console.log(`unused: ${unused.length}, removed: ${removed}`);
if (!process.argv.includes('--dry')) fs.writeFileSync(i18nFile, text);
