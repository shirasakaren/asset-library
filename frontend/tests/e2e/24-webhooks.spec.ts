import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';

test('webhook deliveries open detail drawer', async ({ page }) => {
  await page.goto(ROUTES.adminWebhooks);
  const firstRow = page.locator('tbody tr').first();
  if (await firstRow.count()) {
    await firstRow.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/request body/i)).toBeVisible();
  }
});

test.use(withStorageState('admin'));
