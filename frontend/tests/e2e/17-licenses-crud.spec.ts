import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';

test.use(withStorageState('admin'));

test('admin creates, edits, and deletes an unused license', async ({ page }) => {
  await page.goto(ROUTES.adminLicenses);
  await page.getByRole('button', { name: /new license/i }).click();
  await page.getByLabel(/slug/i).fill('e2e-temp');
  await page.getByLabel(/^name$/i).fill('E2E temp license');
  await page.getByLabel(/description \(en\)/i).fill('Temp license for E2E.');
  await page.getByLabel(/full text \(en\)/i).fill('You may use, modify, and redistribute.');
  await page.getByRole('button', { name: /^create$/i }).click();

  await expect(page.getByText('E2E temp license')).toBeVisible({ timeout: 10_000 });

  // Delete (0 assets reference the new license).
  const row = page.locator('li', { hasText: 'E2E temp license' });
  await row.getByLabel(/delete/i).click();
  await expect(page.getByText('E2E temp license')).toHaveCount(0);
});
