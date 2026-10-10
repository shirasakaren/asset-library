import type { Page } from '@playwright/test';
import { test, expect } from './helpers/test';
import { gotoApp, openProfileMenu } from './helpers/app';
import { pickOthersAsset } from './helpers/seed';

/**
 * Phone smoke (Pixel 7 project). The `@mobile` tag in the title routes these
 * specs to the mobile project only (see playwright.config.ts).
 */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, 'document is wider than the viewport').toBeLessThanOrEqual(0);
}

test.describe('@mobile phone smoke', () => {
  test('@mobile home loads, the banner stays above the navbar, nothing scrolls sideways', async ({
    page,
  }) => {
    await gotoApp(page, '/');
    const banner = page.getByRole('region', { name: 'Demo notice' });
    const navbar = page.getByRole('banner');
    await expect(banner).toBeVisible();
    await expect(page.locator('main article').first()).toBeVisible();

    const b = (await banner.boundingBox())!;
    const n = (await navbar.boundingBox())!;
    expect(b.y + b.height, 'banner must end where the navbar starts').toBeLessThanOrEqual(n.y + 1);
    await expect(navbar.getByRole('button', { name: 'Open profile menu' })).toBeInViewport();

    await expectNoHorizontalScroll(page);
  });

  test('@mobile the profile menu opens on a phone', async ({ page }) => {
    await gotoApp(page, '/');
    const menu = await openProfileMenu(page);
    await expect(menu.getByText('Aria Wijaya')).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Reset demo data' })).toBeInViewport();
  });

  test('@mobile an asset page renders without horizontal scroll', async ({ page }) => {
    const asset = pickOthersAsset();
    await gotoApp(page, `/assets/${asset.slug}/`);
    await expect(page.getByRole('heading', { level: 1, name: asset.title })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download', exact: true }).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
