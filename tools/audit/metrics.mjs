// One-screen summary of the audit metrics. Run from project root: node tools/audit/metrics.mjs
import { execFileSync } from 'child_process';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.resolve(here, '../..');
const run = (s, ...a) => execFileSync(process.execPath, [path.join(here, s), root, ...a], { cwd: here, encoding: 'utf8' });
run('css-report.js'); run('html-js-report.js');
const css = fs.readFileSync(path.join(here, 'css-report.txt'), 'utf8'); const hj = fs.readFileSync(path.join(here, 'hj-report.txt'), 'utf8');
const n = (txt, re) => { const m = txt.match(re); return m ? m[1] : '?'; };
const lines = f => fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8').split('\n').length : 0;
const jsFiles = []; (function w(d){ for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) w(p); else if (f.endsWith('.js')) jsFiles.push(p); } })(path.join(root, fs.existsSync(path.join(root,'src')) ? 'src' : '.').replace(/\/\.$/, ''));
const rows = [
  ['styles.css lines', lines('public/styles.css') || lines('styles.css')],
  ['duplicate selectors', n(css, /SELECTORS DEFINED MULTIPLE TIMES \(same context\): (\d+)/)],
  ['overridden props', n(css, /PROPERTY OVERRIDDEN BY LATER RULE OF SAME SELECTOR: (\d+)/)],
  ['!important', n(css, /## !important: (\d+)/)],
  ['hardcoded colors (css, unique)', n(css, /HARDCODED COLORS outside :root vars: (\d+)/)],
  ['font-size values', n(css, /FONT-SIZE VALUES: (\d+)/)],
  ['border-radius values', n(css, /BORDER-RADIUS: (\d+)/)],
  ['unused css classes', n(css, /CSS CLASSES WITH NO TOKEN MATCH IN HTML\/JS: (\d+)/)],
  ['identical decl blocks', n(css, /IDENTICAL DECLARATION BLOCKS \(>=3 decls\): (\d+)/)],
  ['inline style attrs (html)', n(hj, /HTML inline style attrs: (\d+)/)],
  ['orphan js id refs', n(hj, /NO matching id in HTML or JS templates: (\d+)/)],
  ['style= in js / .style.x=', n(hj, /\.style\.\* assignments in JS: (\d+)/) + ' assigns, ' + n(hj, /style="\.\.\." in templates: (\d+)/) + ' templates'],
  ['hardcoded colors (js, unique)', n(hj, /Hardcoded colors in JS: (\d+)/)],
];
try { const i = execFileSync(process.execPath, [path.join(here, 'i18n.mjs'), root], { encoding: 'utf8' }); rows.push(['unused i18n keys', n(i, /UNUSED KEYS \((\d+)\)/)]); rows.push(['missing i18n keys (t() literal)', (i.match(/t\(\) refs to undefined keys: (.*)/)?.[1] || '').trim().split(/\s+/).filter(Boolean).length]); } catch (e) { rows.push(['i18n', 'error: ' + e.message.split('\n')[0]]); }
try { const d = execFileSync(process.execPath, [path.join(here, 'dead-css.js'), root], { encoding: 'utf8' }); rows.push(['fully-dead css rules', n(d, /fully-dead rules (\d+)/)]); } catch {}
try { const m = execFileSync(process.execPath, [path.join(here, 'methods-report.js'), root], { encoding: 'utf8' }); rows.push(['unreferenced methods', (m.match(/UNREFERENCED: (.*)/)?.[1] || '').trim().split(/\s{2,}/).filter(Boolean).length]); } catch {}
const w = Math.max(...rows.map(r => r[0].length));
console.log(rows.map(([k, v]) => k.padEnd(w + 2) + v).join('\n'));
