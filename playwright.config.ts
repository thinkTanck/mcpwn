import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright drives the top of the Test Pyramid: a few end-to-end tests on the
 * critical path (run -> replay -> export fix report). No e2e specs exist yet;
 * they are authored first (RED) in the green phase. In CI the e2e job runs only
 * when specs are present (see .github/workflows/ci.yml).
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    // The critical path copies a fix report to the clipboard; grant access so the
    // e2e can read it back. Chromium honours these; the app never needs them at runtime.
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // In CI the pipeline's Build step already produced `.next`, so just start the
    // server; locally, build first so `next start` has something to serve.
    command: process.env.CI ? 'npm run start' : 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
