import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';

test.use(withStorageState('admin'));

test('categories CRUD + in-use protection', async ({ page }) => {
  await page.goto(ROUTES.adminCategories);
  await page.getByRole('button', { name: /new category/i }).click();
  await page.getByLabel(/name \(en\)/i).fill('E2E temp category');
  await page.getByRole('button', { name: /^create$/i }).click();

  await expect(page.getByText('E2E temp category')).toBeVisible({ timeout: 10_000 });

  // Try to delete an in-use category — the Delete button must be disabled.
  const inUseRow = page.locator('li', { has: page.locator('text=/[1-9]\\d* assets/') }).first();
  await expect(inUseRow.getByLabel(/delete/i)).toBeDisabled();

  // Delete the empty category we just made.
  const tempRow = page.locator('li', { hasText: 'E2E temp category' });
  await tempRow.getByLabel(/delete/i).click();
  await expect(page.getByText('E2E temp category')).toHaveCount(0);
});
