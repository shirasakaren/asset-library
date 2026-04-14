import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';

test.use(withStorageState('user'));

test('comment → reply → depth-5 cap', async ({ page }) => {
  await page.goto(ROUTES.discover);
  await page.locator('article a').first().click();
  await page.waitForURL(/\/assets\//);

  const composer = page.locator('.tiptap-prose').first();
  await composer.click();
  await composer.fill('Top-level comment');
  await page.getByRole('button', { name: /^post$/i }).first().click();

  await expect(page.getByText('Top-level comment').first()).toBeVisible({ timeout: 10_000 });

  // Reply 5 times — the 5th level should refuse a 6th.
  for (let i = 1; i <= 5; i++) {
    await page.getByRole('button', { name: /reply/i }).first().click();
    const replyEditor = page.locator('.tiptap-prose').nth(1);
    await replyEditor.fill(`Reply ${i}`);
    await page.getByRole('button', { name: /^post$/i }).nth(1).click();
    await expect(page.getByText(`Reply ${i}`).first()).toBeVisible({ timeout: 10_000 });
  }

  await expect(page.getByText(/maximum thread depth/i)).toBeVisible();
});
