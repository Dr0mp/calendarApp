// Snaps font sizes, radii, weights and UI transition durations onto the design-token scale.
// This DOES change rendering slightly (e.g. 0.72rem -> 0.75rem); review screenshots after.
// Usage: node tools/audit/snap-scale.js [--dry]
const fs = require('fs'), path = require('path'), postcss = require('postcss');
const file = path.resolve(__dirname, '../../public/styles.css');
const root = postcss.parse(fs.readFileSync(file, 'utf8'));
const TYPE = [['3xs', 0.6875], ['2xs', 0.75], ['xs', 0.8125], ['sm', 0.875], ['base', 0.9375], ['md', 1], ['lg', 1.125], ['xl', 1.25], ['2xl', 1.5], ['display', 1.75]];
const RADIUS = [['xs', 4], ['sm', 6], ['btn', 8], ['md', 10], ['lg', 14], ['xl', 18]];
const toRem = v => { const m = v.match(/^(-?[\d.]+)(rem|px)$/); if (!m) return null; return m[2] === 'rem' ? +m[1] : +m[1] / 16; };
const nearest = (list, x) => list.reduce((best, cur) => { const d = Math.abs(cur[1] - x), bd = Math.abs(best[1] - x); return d < bd - 1e-9 || (Math.abs(d - bd) < 1e-9 && cur[1] > best[1]) ? cur : best; });
const stats = { font: 0, radius: 0, weight: 0, duration: 0 }; const changes = {};
const note = (k, from, to) => { const key = `${k}: ${from} -> ${to}`; changes[key] = (changes[key] || 0) + 1; };
root.walkDecls(d => {
  if (d.prop.startsWith('--')) return;
  const imp = d.important;
  if (d.prop === 'font-size') {
    const r = toRem(d.value); if (r === null || r > 2) return;
    const [name] = nearest(TYPE, r); d.value = `var(--text-${name})`; stats.font++; note('font-size', `${r}rem`, name);
  } else if (d.prop === 'border-radius' && /^\d+px$/.test(d.value)) {
    const px = parseInt(d.value, 10);
    if (px >= 99) { d.value = 'var(--radius-pill)'; stats.radius++; note('radius', d.value, 'pill'); return; }
    if (px < 3) return;
    const [name] = nearest(RADIUS, px); d.value = `var(--radius-${name})`; stats.radius++; note('radius', `${px}px`, name);
  } else if (d.prop === 'font-weight') {
    const map = { '650': '600', '900': '800' }; if (map[d.value]) { note('weight', d.value, map[d.value]); d.value = map[d.value]; stats.weight++; }
  } else if (d.prop === 'transition' || d.prop === 'transition-duration') {
    const v2 = d.value.replace(/(^|[\s,])(0?\.1|0?\.15|0?\.18)s\b/g, '$1var(--duration-fast)').replace(/(^|[\s,])0?\.2s\b/g, '$1var(--duration-base)').replace(/(^|[\s,])(0?\.24|0?\.25|0?\.3)s\b/g, '$1var(--duration-slow)');
    if (v2 !== d.value) { d.value = v2; stats.duration++; }
  }
  d.important = imp;
});
// make sure the scale tokens exist
root.walkRules(r => {
  if (r.selector !== ':root' || !r.nodes.some(n => n.prop === '--text-base')) return;
  const after = r.nodes.find(n => n.prop === '--text-base');
  if (!r.nodes.some(n => n.prop === '--text-md')) r.insertBefore(after, postcss.decl({ prop: '--text-md', value: '1rem' }));
  const lastRadius = r.nodes.filter(n => n.prop && n.prop.startsWith('--radius-')).pop();
  if (!r.nodes.some(n => n.prop === '--duration-fast')) {
    r.insertAfter(lastRadius, postcss.decl({ prop: '--duration-slow', value: '0.3s' }));
    r.insertAfter(lastRadius, postcss.decl({ prop: '--duration-base', value: '0.2s' }));
    r.insertAfter(lastRadius, postcss.decl({ prop: '--duration-fast', value: '0.15s' }));
    r.insertAfter(lastRadius, postcss.comment({ text: 'Motion' }));
  }
});
console.log(stats); console.log(Object.entries(changes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}× ${k}`).join('\n'));
if (!process.argv.includes('--dry')) fs.writeFileSync(file, root.toResult().css);
