import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  // Baselines are per OS (fonts render differently); record once per OS with `npm run test:update-screens`.
  snapshotPathTemplate: '{testDir}/__screens__/{platform}/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixels: 100, // absorbs Chromium text anti-aliasing jitter (~40px); any real change is far larger
     animations: 'disabled', caret: 'hide' } },
  use: { baseURL: 'http://localhost:3100', viewport: { width: 1280, height: 800 }, locale: 'ro-RO', timezoneId: 'Europe/Bucharest' },
  webServer: {
    command: 'node tests/start-test-server.mjs',
    url: 'http://localhost:3100/api/auth/me',
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
