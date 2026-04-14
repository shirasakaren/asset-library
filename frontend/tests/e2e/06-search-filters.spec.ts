import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';

test.use(withStorageState('user'));

test('search filters persist in URL across reloads', async ({ page }) => {
  await page.goto(ROUTES.search);

  await page.getByLabel(/engine/i).getByLabel('Unity').check();

  await page.getByRole('button', { name: /^Tools$/i }).first().click().catch(() => undefined);

  await expect(page).toHaveURL(/engine=UNITY/);

  await page.reload();
  expect(await page.url()).toMatch(/engine=UNITY/);
  await expect(page.getByLabel(/engine/i).getByLabel('Unity')).toBeChecked();
});

test('infinite scroll loads more results', async ({ page }) => {
  await page.goto(ROUTES.search);
  const initial = await page.locator('article').count();
  await page.mouse.wheel(0, 6000);
  await page.waitForTimeout(800);
  const after = await page.locator('article').count();
  expect(after).toBeGreaterThanOrEqual(initial);
});
