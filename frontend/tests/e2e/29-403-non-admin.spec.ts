import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';

test.use(withStorageState('user'));

test('non-admin lands on /403 when visiting /admin', async ({ page }) => {
  await page.goto(ROUTES.admin);
  await expect(page).toHaveURL(/\/403/);
  await expect(page.getByText(/don't have access/i)).toBeVisible();
});
