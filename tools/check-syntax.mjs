// Syntax-checks every first-party JS file (node --check).
import { execFileSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import path from 'path';
const skip = new Set(['node_modules', '.git', 'test-results', 'playwright-report']);
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { if (skip.has(f)) continue; const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(m?js)$/.test(f)) files.push(p); } })('.');
for (const f of files) execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' });
console.log(`syntax ok: ${files.length} files`);
