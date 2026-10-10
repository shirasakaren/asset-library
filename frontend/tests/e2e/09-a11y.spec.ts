import { test, expect } from './helpers/test';
import { gotoApp } from './helpers/app';
import { expectAccessible } from './helpers/axe';
import { pickOthersAsset } from './helpers/seed';

/**
 * axe on the five key pages (see helpers/axe.ts: all rules on, colour contrast against
 * the committed baseline).
 */
test.describe('accessibility (axe)', () => {
  test('home', async ({ page }) => {
    await gotoApp(page, '/');
    await expect(page.locator('main article').first()).toBeVisible();
    await expectAccessible(page, 'home');
  });

  test('asset detail', async ({ page }) => {
    const asset = pickOthersAsset();
    await gotoApp(page, `/assets/${asset.slug}/`);
    await expect(page.getByRole('heading', { level: 1, name: asset.title })).toBeVisible();
    // The comment composer is lazy-loaded: audit it too.
    await expect(page.locator('[contenteditable="true"].tiptap-prose').first()).toBeEditable();
    await expectAccessible(page, 'asset-detail');
  });

  test('library', async ({ page }) => {
    await gotoApp(page, '/library/');
    await expect(page.getByRole('heading', { level: 1, name: 'My Library' })).toBeVisible();
    await expect(page.locator('main article').first()).toBeVisible();
    await expectAccessible(page, 'library');
  });

  test('search', async ({ page }) => {
    await gotoApp(page, '/search/?q=unity');
    await expect(page.locator('main article').first()).toBeVisible();
    await expectAccessible(page, 'search');
  });

  test('admin dashboard', async ({ page }) => {
    await gotoApp(page, '/admin/');
    await expect(page.getByRole('heading', { level: 2, name: 'Downloads (30d)' })).toBeVisible();
    await expectAccessible(page, 'admin-dashboard');
  });
});
