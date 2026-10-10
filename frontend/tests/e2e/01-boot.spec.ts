import { test, expect } from './helpers/test';
import { gotoApp, openProfileMenu } from './helpers/app';

test.describe('boot', () => {
  test('opens straight into the app as the demo admin, no sign-in', async ({ page }) => {
    await gotoApp(page, '/');

    // No auth redirect of any kind.
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.getByRole('link', { name: /sign in|log in|masuk/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /sign in|log in|masuk/i })).toHaveCount(0);

    // Demo banner.
    const banner = page.getByRole('region', { name: 'Demo notice' });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Preview — you're exploring a demo");
    await expect(banner).toContainText('Aria Wijaya');

    // Persona + role in the profile menu.
    const menu = await openProfileMenu(page);
    await expect(menu.getByText('Aria Wijaya')).toBeVisible();
    await expect(menu.getByText('Admin', { exact: true })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Reset demo data' })).toBeVisible();
    await page.keyboard.press('Escape');

    // Admin-only navigation is reachable (the persona is an admin).
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'ADMIN', exact: true }),
    ).toHaveAttribute('href', '/admin/');
  });

  test('discover renders asset cards with loaded thumbnails', async ({ page }) => {
    await gotoApp(page, '/');
    const cards = page.locator('main article');
    await expect(cards.nth(7)).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(8);

    // Thumbnails are lazy: bring the first cards into view, then wait for the decode.
    const imgs = cards.locator('img');
    await expect(async () => {
      const n = Math.min(await cards.count(), 8);
      for (let i = 0; i < n; i++) await cards.nth(i).scrollIntoViewIfNeeded();
      const widths = await imgs.evaluateAll((els) =>
        els.slice(0, 8).map((el) => (el as HTMLImageElement).naturalWidth),
      );
      expect(widths.length).toBeGreaterThanOrEqual(8);
      expect(widths.every((w) => w > 0)).toBe(true);
    }).toPass();
    // Failed /thumbs/ requests fail the test through the shared request guard (helpers/test.ts).
  });

  test('footer carries the attribution notice and the takedown contact', async ({ page }) => {
    await gotoApp(page, '/');
    const footer = page.getByRole('contentinfo');
    await expect(footer).toContainText(/belong to their (respective )?creators/i);
    await expect(footer.locator('a[href^="mailto:it@labmgm.org"]')).toBeVisible();
  });

  test('is not indexable', async ({ page }) => {
    await gotoApp(page, '/');
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute('content', /noindex/);
  });
});
