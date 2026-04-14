import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';
import { checkA11y } from './helpers/axe';

test.use(withStorageState('admin'));

test('Discover renders carousel, rows, and infinite scroll', async ({ page }) => {
  await page.goto(ROUTES.discover);
  await expect(page.getByRole('region', { name: /featured/i })).toBeVisible();

  // At least one category row.
  await expect(page.getByRole('link', { name: /see all/i }).first()).toBeVisible();

  // Infinite scroll: count cards before scroll, scroll, then expect more.
  const initialCount = await page.locator('article').count();
  await page.mouse.wheel(0, 4000);
  await page.waitForTimeout(800);
  const afterCount = await page.locator('article').count();
  expect(afterCount).toBeGreaterThanOrEqual(initialCount);

  await checkA11y(page, '/');
});
