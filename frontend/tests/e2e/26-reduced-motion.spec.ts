import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';

test.use({ ...withStorageState('user'), colorScheme: 'light' });

test('prefers-reduced-motion disables carousel auto-rotate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(ROUTES.discover);

  const heroes = page.getByRole('region', { name: /featured/i });
  await expect(heroes).toBeVisible();
  const firstHeadline = await heroes.locator('h2').first().innerText();
  await page.waitForTimeout(6_500); // longer than the 5s rotate interval
  expect(await heroes.locator('h2').first().innerText()).toBe(firstHeadline);
});
