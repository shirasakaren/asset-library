import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';

test.use(withStorageState('user'));

test('user submits a request and sees it in history', async ({ page }) => {
  await page.goto(ROUTES.request);
  await page.getByRole('button', { name: /new request/i }).click();
  await page.getByLabel(/asset link/i).fill('https://example.com/cool-asset');
  await page.getByLabel(/asset type/i).fill('Unity 3D model');
  await page.getByLabel(/intended use/i).fill('Hardware-in-the-loop simulator demo asset.');
  await page.getByRole('button', { name: /submit request/i }).click();

  await expect(page.getByText(/example\.com\/cool-asset/)).toBeVisible({ timeout: 10_000 });
});
