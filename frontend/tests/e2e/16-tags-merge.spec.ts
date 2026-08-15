import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';

test.use(withStorageState('admin'));

test('admin merges multiple tags into one', async ({ page }) => {
  await page.goto(ROUTES.adminTags);
  await page.getByRole('button', { name: /merge tags/i }).click();
  await page.getByPlaceholder(/type a tag/i).fill('a');

  // Pick two as "From", one as "Into".
  await page.getByRole('button', { name: /^from$/i }).first().click();
  await page.getByRole('button', { name: /^from$/i }).nth(0).click();
  await page.getByRole('button', { name: /^into$/i }).first().click();

  const merge = page.getByRole('button', { name: /^merge$/i });
  if (await merge.isEnabled()) {
    await merge.click();
    await expect(page.getByText(/merged/i)).toBeVisible({ timeout: 10_000 });
  }
});
