import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';

test.use(withStorageState('admin'));

test('admin views AV queue and acknowledges a flagged version', async ({ page }) => {
  await page.goto(ROUTES.adminAv);
  const firstAck = page.getByRole('button', { name: /^acknowledge$/i }).first();
  if (await firstAck.count()) {
    await firstAck.click();
    await expect(page.getByText(/acknowledged/i)).toBeVisible({ timeout: 10_000 });
  } else {
    await expect(page.getByText(/no infected versions/i)).toBeVisible();
  }
});
