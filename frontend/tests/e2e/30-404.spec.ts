import { test, expect, withStorageState } from './helpers/fixtures';

test.use(withStorageState('user'));

test('unknown route renders branded 404', async ({ page }) => {
  await page.goto('/this-route-does-not-exist-12345');
  await expect(page.getByText(/we couldn['’]t find that/i)).toBeVisible();
});
