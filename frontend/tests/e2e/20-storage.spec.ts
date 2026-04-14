import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';

test.use(withStorageState('admin'));

test('admin sees per-user + per-asset storage tables', async ({ page }) => {
  await page.goto(ROUTES.adminStorage);
  await expect(page.getByRole('heading', { name: /storage/i })).toBeVisible();

  await page.getByRole('tab', { name: /by user/i }).click();
  await expect(page.locator('table')).toBeVisible();

  await page.getByRole('tab', { name: /by asset/i }).click();
  await expect(page.locator('table')).toBeVisible();
});
