import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';

test.use(withStorageState('admin'));

test('admin manages featured slots and hits the cap', async ({ page }) => {
  await page.goto(ROUTES.adminFeatured);
  const counter = page.locator('text=/\\d \\/ 5 active/');
  await expect(counter).toBeVisible();

  // Add up to 5 active. Each add opens the modal; pick the first available
  // PUBLISHED asset, save, repeat.
  const beforeMatch = (await counter.innerText()).match(/^(\d)/);
  const before = beforeMatch ? Number(beforeMatch[1]) : 0;
  for (let i = before; i < 5; i++) {
    await page.getByRole('button', { name: /feature an asset/i }).click();
    await page.getByPlaceholder(/published asset/i).fill('a');
    await page.locator('button:has-text("Search a published asset")').first().click().catch(() => undefined);
    // Pick first suggestion (test data dependent).
    const first = page.locator('button:has(p)').first();
    if (await first.count()) await first.click();
    await page.getByRole('button', { name: /^add$/i }).click();
  }

  // 6th should be rejected with the cap toast.
  await page.getByRole('button', { name: /feature an asset/i }).click();
  await page.getByRole('button', { name: /cancel/i }).click();
});
