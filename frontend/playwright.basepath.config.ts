import { defineConfig, devices } from '@playwright/test';
import { ORIGIN, PORT, PREFIX } from './tests/e2e-basepath/prefix';

/**
 * Base-path smoke suite: the static export built with `NEXT_PUBLIC_BASE_PATH=/asset-library`
 * and served under that prefix, like the GitHub project Pages URL
 * (https://<owner>.github.io/asset-library/). The 46 specs of the main suite
 * (playwright.config.ts) cover the behavior at the host root; this small suite only checks that
 * everything still works, and that no URL escapes the prefix, under a sub-path.
 *
 *   NEXT_PUBLIC_BASE_PATH=/asset-library pnpm build && pnpm test:e2e:basepath
 *
 * The prefix is `/asset-library` unless E2E_BASE_PATH says otherwise (tests/e2e-basepath/prefix.ts).
 *
 * `webServer` is scripts/serve-export.mjs with `--base`: files below the prefix, the 404 shell
 * (status 404) for unknown paths below it and for every path outside it, `/asset-library` ->
 * 301 `/asset-library/`.
 */
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e-basepath',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI
    ? [['list'], ['html', { outputFolder: 'playwright-report/basepath', open: 'never' }]]
    : 'list',
  // Under the folders the main suite already uses (git-ignored, uploaded by the CI failure step).
  outputDir: 'test-results/basepath',
  use: {
    // The trailing slash matters: specs use paths WITHOUT a leading slash (`library/`), which
    // resolve below the prefix; `/library/` would resolve to the host root, outside the app.
    baseURL: `${ORIGIN}${PREFIX}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node scripts/serve-export.mjs out ${PORT} --base ${PREFIX}`,
    // The prefix redirect target: answers 200 only when the export is served under the prefix.
    url: `${ORIGIN}${PREFIX}/`,
    reuseExistingServer: !CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
