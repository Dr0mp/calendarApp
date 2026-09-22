// Moves static inline style="" declarations (HTML and JS templates) into named utility classes.
// Each declaration becomes one atomic class (u-mt-24, u-flex, u-text-muted…) defined once in
// the "Utilities" section at the end of styles.css. style="display: none;" (JS-driven visibility)
// and any declaration containing ${…} stay inline. Usage: node inline-to-utilities.cjs [--dry]
const fs = require('fs'), path = require('path');
const PUB = path.resolve(__dirname, '../../public');
const walk = d => fs.readdirSync(d).flatMap(f => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? walk(p) : [p]; });
const files = [path.join(PUB, 'index.html'), ...walk(path.join(PUB, 'src')).filter(f => f.endsWith('.js') && !f.includes('/data/'))];
const TYPE = { '0.6875rem': '3xs', '0.75rem': '2xs', '0.8125rem': 'xs', '0.875rem': 'sm', '0.9375rem': 'base', '1rem': 'md', '1.125rem': 'lg', '1.25rem': 'xl', '1.5rem': '2xl', '1.75rem': 'display' };
const SCALE = Object.entries(TYPE).map(([v, n]) => [n, parseFloat(v)]);
const toRem = v => { const m = v.match(/^([\d.]+)(rem|px)$/); return m ? (m[2] === 'rem' ? +m[1] : +m[1] / 16) : null; };
const snapFont = v => { const r = toRem(v); if (r === null) return null; return SCALE.reduce((b, c) => Math.abs(c[1] - r) < Math.abs(b[1] - r) - 1e-9 || (Math.abs(Math.abs(c[1] - r) - Math.abs(b[1] - r)) < 1e-9 && c[1] > b[1]) ? c : b)[0]; };
const PALETTE = { 'ffffff': 'white', '38bdf8': 'sky-400', '0ea5e9': 'sky-500', 'c084fc': 'purple-400', 'a855f7': 'purple-500', 'fbbf24': 'amber-400', 'f59e0b': 'amber-500', '34d399': 'emerald-400', '10b981': 'emerald-500', 'c4b5fd': 'violet-300', '8b5cf6': 'violet-500', 'ef4444': 'red-500', '64748b': 'slate-500' };
// primary accent colours from the (dark) theme that are hardcoded in markup
const PRIMARY_RGB = { '4da3e7': 'primary', '72bdf5': 'primary-bright' };
function colorToken(v) {
  const h = v.match(/^#([0-9a-f]{6})$/i); if (h && PALETTE[h[1].toLowerCase()]) return { name: PALETTE[h[1].toLowerCase()], css: `rgb(var(--${PALETTE[h[1].toLowerCase()]}))` };
  const r = v.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (r) { const hex = [r[1], r[2], r[3]].map(x => (+x).toString(16).padStart(2, '0')).join(''); const a = r[4]; const pct = Math.round(parseFloat(a) * 100);
    if (PALETTE[hex]) return { name: `${PALETTE[hex]}-${pct}`, css: `rgb(var(--${PALETTE[hex]}) / ${a})` };
    if (hex === '4da3e7') return { name: `primary-${pct}`, css: `rgb(77 163 231 / ${a})` };
  }
  return null;
}
const COLOR = { 'var(--text-muted)': 'muted', 'var(--text-secondary)': 'secondary', 'var(--text-primary)': 'primary', '#38bdf8': 'sky', '#8b5cf6': 'violet', '#64748b': 'slate', 'var(--accent-blue)': 'info', '#72bdf5': 'primary-bright' };
const COLOR_VALUE = { muted: 'var(--text-muted)', secondary: 'var(--text-secondary)', primary: 'var(--text-primary)', sky: 'rgb(var(--sky-400))', violet: 'rgb(var(--violet-500))', slate: 'rgb(var(--slate-500))', info: 'var(--status-info)', 'primary-bright': 'var(--primary-bright)' };
const slug = v => v.replace(/px/g, '').replace(/%/g, 'pct').replace(/[^a-z0-9.-]+/gi, '-').replace(/\./g, '_').replace(/^-|-$/g, '');
const sides = (v) => { const p = v.trim().split(/\s+/); const [t, r = t, b = t, l = r] = p; return { t, r, b, l }; };
const defs = new Map(); // class -> css declarations
const add = (cls, decl) => { if (!defs.has(cls)) defs.set(cls, decl); return cls; };
function classesFor(prop, value) {
  value = value.trim();
  const out = [];
  switch (prop) {
    case 'display': out.push(add(`u-${value === 'flex' ? 'flex' : value === 'block' ? 'block' : value === 'inline-flex' ? 'inline-flex' : 'd-' + slug(value)}`, `display: ${value};`)); break;
    case 'align-items': out.push(add(`u-items-${slug(value.replace('flex-', ''))}`, `align-items: ${value};`)); break;
    case 'justify-content': out.push(add(`u-justify-${slug(value.replace('flex-', '').replace('space-', ''))}`, `justify-content: ${value};`)); break;
    case 'flex-direction': out.push(add(`u-${value === 'column' ? 'col' : 'dir-' + slug(value)}`, `flex-direction: ${value};`)); break;
    case 'flex-wrap': out.push(add(`u-${value === 'wrap' ? 'wrap' : 'wrap-' + slug(value)}`, `flex-wrap: ${value};`)); break;
    case 'flex': out.push(add(`u-flex-${slug(value)}`, `flex: ${value};`)); break;
    case 'gap': out.push(add(`u-gap-${slug(value)}`, `gap: ${value};`)); break;
    case 'margin': case 'padding': {
      const s = sides(value), k = prop[0];
      [['t', 'top'], ['r', 'right'], ['b', 'bottom'], ['l', 'left']].forEach(([a, full]) => out.push(add(`u-${k}${a}-${slug(s[a])}`, `${prop}-${full}: ${s[a]};`)));
      break;
    }
    case 'margin-top': case 'margin-bottom': case 'margin-left': case 'margin-right': case 'padding-top': case 'padding-bottom': case 'padding-left': case 'padding-right': {
      const [k, side] = prop.split('-'); out.push(add(`u-${k[0]}${side[0]}-${slug(value)}`, `${prop}: ${value};`)); break;
    }
    case 'font-size': { const n = snapFont(value); out.push(n ? add(`u-text-${n}`, `font-size: var(--text-${n});`) : add(`u-fs-${slug(value)}`, `font-size: ${value};`)); break; }
    case 'font-weight': out.push(add(`u-fw-${slug(value)}`, `font-weight: ${value};`)); break;
    case 'color': {
      const n = COLOR[value]; if (n) { out.push(add(`u-color-${n}`, `color: ${COLOR_VALUE[n]};`)); break; }
      if (value === 'var(--status-info)') { out.push(add('u-color-info', 'color: var(--status-info);')); break; }
      if (value === 'var(--primary)') { out.push(add('u-color-accent', 'color: var(--primary);')); break; }
      const t = colorToken(value); if (!t) return null; out.push(add(`u-color-${t.name}`, `color: ${t.css};`)); break;
    }
    case 'background': case 'background-color': {
      if (value === 'var(--bg-card)') { out.push(add('u-bg-card', 'background: var(--bg-card);')); break; }
      if (value === 'rgba(255, 255, 255, 0.03)') { out.push(add('u-bg-white-3', 'background: rgb(var(--white) / 0.03);')); break; }
      const t = colorToken(value); if (!t) return null; out.push(add(`u-bg-${t.name}`, `background: ${t.css};`)); break;
    }
    case 'border-color': { const t = colorToken(value); if (!t) return null; out.push(add(`u-border-color-${t.name}`, `border-color: ${t.css};`)); break; }
    case 'border': {
      if (value === '1px solid var(--border-subtle)') { out.push(add('u-border', 'border: 1px solid var(--border-subtle);')); break; }
      const m = value.match(/^1px solid (.+)$/); const t = m && colorToken(m[1]); if (!t) return null;
      out.push(add(`u-border-${t.name}`, `border: 1px solid ${t.css};`)); break;
    }
    case 'border-radius': {
      const tok = value.match(/^var\(--radius-([\w-]+)\)$/); if (tok) { out.push(add(`u-rounded-${tok[1]}`, `border-radius: ${value};`)); break; }
      if (value === '8px') { out.push(add('u-rounded-btn', 'border-radius: var(--radius-btn);')); break; }
      return null;
    }
    case 'grid-template-columns': if (value === '1fr 1fr') { out.push(add('u-grid-cols-2', 'grid-template-columns: 1fr 1fr;')); break; } return null;
    case 'word-break': out.push(add(`u-break-${slug(value)}`, `word-break: ${value};`)); break;
    case 'align-self': out.push(add(`u-self-${slug(value.replace('flex-', ''))}`, `align-self: ${value};`)); break;
    case 'transition': if (value === 'color 0.15s ease') { out.push(add('u-transition-color', 'transition: color var(--duration-fast) ease;')); break; } return null;
    case 'cursor': out.push(add(`u-cursor-${slug(value)}`, `cursor: ${value};`)); break;
    case 'white-space': out.push(add(`u-${value === 'nowrap' ? 'nowrap' : 'ws-' + slug(value)}`, `white-space: ${value};`)); break;
    case 'text-align': out.push(add(`u-text-${slug(value)}`, `text-align: ${value};`)); break;
    case 'text-decoration': out.push(add(`u-decoration-${slug(value)}`, `text-decoration: ${value};`)); break;
    case 'line-height': out.push(add(`u-leading-${slug(value)}`, `line-height: ${value};`)); break;
    case 'opacity': out.push(add(`u-opacity-${slug(value)}`, `opacity: ${value};`)); break;
    case 'accent-color': out.push(add(`u-accent-${value === 'var(--primary)' ? 'primary' : slug(value)}`, `accent-color: ${value};`)); break;
    case 'width': out.push(add(`u-w-${value === '100%' ? 'full' : slug(value)}`, `width: ${value};`)); break;
    case 'height': out.push(add(`u-h-${slug(value)}`, `height: ${value};`)); break;
    case 'max-width': out.push(add(`u-maxw-${slug(value)}`, `max-width: ${value};`)); break;
    case 'max-height': out.push(add(`u-maxh-${slug(value)}`, `max-height: ${value};`)); break;
    case 'object-fit': out.push(add(`u-object-${slug(value)}`, `object-fit: ${value};`)); break;
    case 'vertical-align': out.push(add(`u-valign-${slug(value)}`, `vertical-align: ${value};`)); break;
    case 'text-transform': out.push(add(`u-${slug(value)}`, `text-transform: ${value};`)); break;
    case 'font-family': if (value === 'monospace' || value === 'var(--font-mono)') out.push(add('u-font-mono', 'font-family: var(--font-mono);')); else return null; break;
    case 'overflow': out.push(add(`u-overflow-${slug(value)}`, `overflow: ${value};`)); break;
    case 'text-overflow': out.push(add(`u-truncate-${slug(value)}`, `text-overflow: ${value};`)); break;
    case 'border-top': if (value === '1px solid var(--border-subtle)') out.push(add('u-border-t', 'border-top: 1px solid var(--border-subtle);')); else return null; break;
    case 'filter': if (value === 'brightness(1.2)') out.push(add('u-brighten', 'filter: brightness(1.2);')); else return null; break;
    default: return null;
  }
  return out;
}
let converted = 0, partial = 0, untouched = 0; const leftovers = {};
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8'); const orig = s;
  // style="..." within a tag that may also contain class="..."; handle tags in HTML or template strings
  s = s.replace(/<([a-z][a-z0-9-]*)((?:[^<>`]|`[^`]*`|\$\{[^}]*\})*?)\sstyle="([^"]*)"((?:[^<>`]|\$\{[^}]*\})*?)(\/?)>/gi, (m, tag, pre, style, post, selfClose) => {
    if (style.includes('${')) { untouched++; return m; }
    const decls = style.split(';').map(x => x.trim()).filter(Boolean).map(x => { const i = x.indexOf(':'); return [x.slice(0, i).trim().toLowerCase(), x.slice(i + 1).trim()]; });
    const keep = [], cls = [];
    for (const [p, v] of decls) {
      if (p === 'display' && v === 'none') { keep.push(`${p}: ${v};`); continue; }
      const c = classesFor(p, v);
      if (c) cls.push(...c); else { keep.push(`${p}: ${v};`); leftovers[`${p}: ${v}`] = (leftovers[`${p}: ${v}`] || 0) + 1; }
    }
    if (!cls.length) { untouched++; return m; }
    keep.length ? partial++ : converted++;
    let attrs = pre + post;
    const clsRe = /\sclass="([^"]*)"/;
    if (clsRe.test(attrs)) attrs = attrs.replace(clsRe, (x, c) => ` class="${c} ${cls.join(' ')}"`);
    else attrs = ` class="${cls.join(' ')}"` + attrs;
    return `<${tag}${attrs}${keep.length ? ` style="${keep.join(' ')}"` : ''}${selfClose}>`;
  });
  if (s !== orig && !process.argv.includes('--dry')) fs.writeFileSync(f, s);
}
const css = [...defs.entries()].sort().map(([c, d]) => `.${c} { ${d.replace(/;$/, ' !important;')} }`).join('\n');
console.log(`fully converted ${converted}, partially ${partial}, left inline ${untouched}; ${defs.size} utility classes`);
console.log('declarations left inline:', Object.entries(leftovers).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}× ${k}`).join(' | '));
if (!process.argv.includes('--dry')) {
  const cssFile = path.join(PUB, 'styles.css');
  let sheet = fs.readFileSync(cssFile, 'utf8');
  const marker = '/* === Utilities (generated by tools/refactor/inline-to-utilities.cjs) === */';
  if (sheet.includes(marker)) sheet = sheet.slice(0, sheet.indexOf(marker));
  fs.writeFileSync(cssFile, sheet.trimEnd() + `\n\n${marker}\n/* Single-purpose classes that replace former inline styles. Like the inline styles they replace,\n   they must beat component rules, hence !important (the one sanctioned use besides [hidden]). */\n${css}\n`);
}
