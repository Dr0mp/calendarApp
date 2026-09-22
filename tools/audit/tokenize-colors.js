// Replaces raw Tailwind-palette colours in styles.css with primitive tokens (space-separated RGB
// triplets so alpha still works): #8b5cf6 -> rgb(var(--violet-500)), rgba(139,92,246,.35) ->
// rgb(var(--violet-500) / 0.35). Computed styles are unchanged. Colours outside the palette are
// left as-is and listed. Usage: node tools/audit/tokenize-colors.js [--dry]
const fs = require('fs'), path = require('path'), postcss = require('postcss');
const file = path.resolve(__dirname, '../../public/styles.css');
const PALETTE = {
  white: 'ffffff', black: '000000',
  'slate-50': 'f8fafc', 'slate-100': 'f1f5f9', 'slate-200': 'e2e8f0', 'slate-300': 'cbd5e1', 'slate-400': '94a3b8', 'slate-500': '64748b', 'slate-600': '475569', 'slate-700': '334155', 'slate-800': '1e293b', 'slate-900': '0f172a',
  'gray-900': '111827',
  'red-100': 'fee2e2', 'red-300': 'fca5a5', 'red-400': 'f87171', 'red-500': 'ef4444', 'red-600': 'dc2626', 'red-700': 'b91c1c',
  'amber-50': 'fffbeb', 'amber-100': 'fef3c7', 'amber-200': 'fde68a', 'amber-400': 'fbbf24', 'amber-500': 'f59e0b', 'amber-600': 'd97706', 'amber-700': 'b45309',
  'green-100': 'dcfce7', 'green-600': '16a34a',
  'emerald-50': 'ecfdf5', 'emerald-400': '34d399', 'emerald-500': '10b981', 'emerald-700': '047857',
  'sky-100': 'e0f2fe', 'sky-400': '38bdf8', 'sky-500': '0ea5e9', 'sky-600': '0284c7', 'sky-700': '0369a1', 'sky-800': '075985',
  'blue-300': '93c5fd', 'blue-400': '60a5fa', 'blue-500': '3b82f6', 'blue-600': '2563eb', 'blue-700': '1d4ed8',
  'indigo-500': '6366f1',
  'violet-300': 'c4b5fd', 'violet-500': '8b5cf6', 'violet-600': '7c3aed',
  'purple-50': 'faf5ff', 'purple-100': 'f3e8ff', 'purple-200': 'e9d5ff', 'purple-400': 'c084fc', 'purple-500': 'a855f7', 'purple-600': '9333ea', 'purple-700': '7e22ce',
  'fuchsia-50': 'fdf4ff', 'pink-500': 'ec4899',
};
const byHex = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [v, k]));
const expand = h => { h = h.toLowerCase(); return h.length === 3 ? h.split('').map(c => c + c).join('') : h; };
const triplet = h => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(' ');
const root = postcss.parse(fs.readFileSync(file, 'utf8'));
const used = new Set(); const leftovers = {}; let replaced = 0;
root.walkDecls(d => {
  if (d.prop.startsWith('--') && d.parent.selector === ':root' && d.parent.parent.type === 'root' && d.prop.match(/^--(white|black|slate|gray|red|amber|green|emerald|sky|blue|indigo|violet|purple|fuchsia|pink)/)) return;
  let v = d.value;
  v = v.replace(/#([0-9a-f]{6}|[0-9a-f]{3})\b(?![0-9a-f])/gi, (m, h) => { const n = byHex[expand(h)]; if (!n) { leftovers[m.toLowerCase()] = (leftovers[m.toLowerCase()] || 0) + 1; return m; } used.add(n); replaced++; return `rgb(var(--${n}))`; });
  v = v.replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+%?))?\s*\)/gi, (m, r, g, b, a) => {
    const h = [r, g, b].map(x => (+x).toString(16).padStart(2, '0')).join(''); const n = byHex[h];
    if (!n) { leftovers[m.replace(/\s+/g, '')] = (leftovers[m.replace(/\s+/g, '')] || 0) + 1; return m; }
    used.add(n); replaced++; return a === undefined ? `rgb(var(--${n}))` : `rgb(var(--${n}) / ${a})`;
  });
  d.value = v;
});
// primitives block at the very top
const block = postcss.rule({ selector: ':root' });
block.append(postcss.comment({ text: 'Colour primitives (Tailwind palette) as RGB triplets: use rgb(var(--name)) or rgb(var(--name) / 0.4). Semantic tokens below build on these.' }));
Object.entries(PALETTE).filter(([k]) => used.has(k)).forEach(([k, v]) => block.append(postcss.decl({ prop: `--${k}`, value: triplet(v) })));
root.prepend(block);
console.log(`replaced ${replaced} colour values with ${used.size} primitives`);
console.log('left as raw values:', Object.entries(leftovers).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' '));
if (!process.argv.includes('--dry')) fs.writeFileSync(file, root.toResult().css);
