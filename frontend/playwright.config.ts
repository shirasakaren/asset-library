import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite for the static export (`pnpm build` -> `out/`).
 *
 * `webServer` serves `out/` with scripts/serve-export.mjs, which mimics GitHub
 * Pages (files, then `/404.html` with status 404 for unknown paths). Set
 * E2E_BASE_URL to run the same specs against an already deployed URL; the
 * local server is then still started but unused (harmless).
 *
 * Every test gets a fresh browser context (Playwright default), so IndexedDB
 * and localStorage never leak between tests: each test starts from the seed.
 */
const PORT = 4173;
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
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
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
