import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';

test.use(withStorageState('admin'));

test('admin promotes a user', async ({ page }) => {
  await page.goto(ROUTES.adminUsers);
  await page.getByRole('button', { name: /promote admin/i }).click();
  await page.getByPlaceholder(/name or email/i).fill('e2e');
  // pick first candidate
  const first = page.locator('button:has(span:text("@"))').first();
  if (await first.count()) {
    await first.click();
    const email = await page.locator('code.font-mono').first().innerText();
    await page.getByPlaceholder(email).fill(email);
    await page.getByRole('button', { name: /^promote$/i }).click();
    await expect(page.getByText(/promoted/i)).toBeVisible({ timeout: 10_000 });
  }
});
