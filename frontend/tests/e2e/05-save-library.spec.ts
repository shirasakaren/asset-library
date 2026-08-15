import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';

test.use(withStorageState('user'));

test('save → library → hide → unhide → remove', async ({ page }) => {
  await page.goto(ROUTES.discover);
  const card = page.locator('article').first();
  await card.hover();
  await card.getByRole('button', { name: /save/i }).first().click();

  await page.goto(ROUTES.library);
  await expect(page.locator('article').first()).toBeVisible();

  // Switch to list view to access hide/quick-download
  await page.getByRole('button', { name: /list view/i }).click();
  await page.getByRole('button', { name: /hide/i }).first().click();
  await expect(page.locator('article').first()).toHaveAttribute('class', /opacity-60/);

  // Visibility filter → Hidden → row appears
  await page.getByLabel(/visibility/i).getByText(/hidden/i).first().click();
  await expect(page.locator('article').first()).toBeVisible();

  // Unhide → back
  await page.getByRole('button', { name: /unhide/i }).first().click();

  // Remove (via the save button toggle off)
  await page.getByLabel(/visibility/i).getByText(/visible/i).first().click();
  await page.getByRole('button', { name: /saved/i }).first().click();
});
