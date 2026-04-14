import { test, withStorageState } from './helpers/fixtures';

test.use(withStorageState('contributor'));

test('contributor creates a new version', async ({ page }) => {
  await page.goto('/publish/manage');
  await page.getByRole('button', { name: /actions/i }).first().click();
  await page.getByRole('menuitem', { name: /new version/i }).click();

  await page.waitForURL(/\/publish\/[\w-]+\/versions\/new/);
  await page.getByLabel(/new semver/i).fill('1.0.1');
  await page.getByRole('button', { name: /create version/i }).click();

  await page.waitForURL(/\/publish\//, { timeout: 15_000 });
});
