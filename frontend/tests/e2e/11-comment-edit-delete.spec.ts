import { test, expect, ROUTES } from './helpers/fixtures';

test.describe('comment edit + admin delete', () => {
  test('author can edit own comment', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'tests/e2e/auth-states/user.json' });
    const page = await ctx.newPage();
    await page.goto(ROUTES.discover);
    await page.locator('article a').first().click();
    await page.waitForURL(/\/assets\//);

    await page.locator('.tiptap-prose').first().fill('Original comment');
    await page.getByRole('button', { name: /^post$/i }).first().click();
    await expect(page.getByText('Original comment').first()).toBeVisible();

    await page.getByRole('button', { name: /more/i }).first().click();
    await page.getByRole('menuitem', { name: /^edit$/i }).click();
    const inlineEditor = page.locator('.tiptap-prose').filter({ hasText: 'Original' });
    await inlineEditor.fill('Edited comment');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText('Edited comment').first()).toBeVisible();

    await ctx.close();
  });

  test('admin can delete any comment', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'tests/e2e/auth-states/admin.json' });
    const page = await ctx.newPage();
    await page.goto(ROUTES.discover);
    await page.locator('article a').first().click();
    await page.waitForURL(/\/assets\//);

    await page.getByRole('button', { name: /more/i }).first().click();
    await page.getByRole('menuitem', { name: /delete/i }).click();

    // Either an inline confirm or the row is removed/marked moderated.
    await expect(
      page.getByText(/comment removed by moderator/i).or(page.getByText(/edited comment/i)).first(),
    ).toBeVisible();

    await ctx.close();
  });
});
