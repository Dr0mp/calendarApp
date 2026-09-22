import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:3100/'); await p.waitForTimeout(500);
await p.screenshot({ path: '/tmp/x-login.png' });
await p.fill('#direct-login-username', 'demo_admin'); await p.fill('#direct-login-password', 'demo123'); await p.press('#direct-login-password', 'Enter');
await p.waitForTimeout(800); await p.screenshot({ path: '/tmp/x-after.png' });
for (const id of ['nav-events-btn','nav-schedule-btn','nav-my-events-btn','nav-admin-btn']) { await p.click('#'+id); await p.waitForTimeout(500); await p.screenshot({ path: `/tmp/x-${id}.png` }); }
await b.close();
