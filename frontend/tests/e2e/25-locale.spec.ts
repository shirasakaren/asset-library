import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';

test.use(withStorageState('user'));

test('switching to ID flips nav and key surfaces to Indonesian', async ({ page }) => {
  await page.goto(ROUTES.discover);
  await page.getByLabel(/language/i).click();
  await page.getByRole('button', { name: /bahasa indonesia/i }).click();

  await expect(page.getByRole('link', { name: /jelajah/i }).first()).toBeVisible({ timeout: 10_000 });

  await page.goto(ROUTES.publish);
  await expect(page.getByRole('heading', { name: /publikasikan/i }).first()).toBeVisible();

  await page.goto(ROUTES.notifications);
  await expect(page.getByRole('heading', { name: /notifikasi/i }).first()).toBeVisible();
});
