import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';
import { checkA11y } from './helpers/axe';

test.use(withStorageState('admin'));

test('asset detail switches tabs and opens download popup', async ({ page }) => {
  await page.goto(ROUTES.discover);
  const firstCard = page.locator('article a').first();
  await firstCard.click();
  await page.waitForURL(/\/assets\//);

  // Tabs
  for (const label of [/description/i, /package/i, /compatibility/i, /versions/i]) {
    const tab = page.getByRole('tab', { name: label });
    if (await tab.count()) {
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
    }
  }

  // Download popup
  await page.getByRole('button', { name: /^download$/i }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: /download/i })).toBeVisible();

  await checkA11y(page, '/assets/[slug]');
});
