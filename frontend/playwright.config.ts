import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite for the static export (`pnpm build` -> `out/`).
 *
 * `webServer` serves `out/` with scripts/serve-export.mjs, which mimics GitHub
 * Pages (files, then `/404.html` with status 404 for unknown paths). Set
 * E2E_BASE_URL to run the same specs against an already deployed URL (served
 * at the host root); no local server is started then.
 *
 * Every test gets a fresh browser context (Playwright default), so IndexedDB
 * and localStorage never leak between tests: each test starts from the seed.
 */
// An uncommon port, so a dev server or another preview on 4173/3000 is never mistaken for the export.
const PORT = 4317;
const REMOTE = process.env.E2E_BASE_URL;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : 'list',
  use: {
    baseURL: REMOTE ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Against a deployed site (E2E_BASE_URL) no local server is started, so `out/` is not needed.
  webServer: REMOTE
    ? undefined
    : {
        command: `node scripts/serve-export.mjs out ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !CI,
        timeout: 60_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      grepInvert: /@mobile/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      grep: /@mobile/,
    },
  ],
});
