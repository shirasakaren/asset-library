import { test, expect } from './helpers/test';
import { gotoApp } from './helpers/app';
import { expectNoSeriousA11yViolations } from './helpers/axe';
import { pickOthersAsset } from './helpers/seed';

/**
 * axe smoke on the five key pages. Fails on serious/critical violations except
 * the documented allowlist in helpers/axe.ts.
 */
test.describe('accessibility (axe)', () => {
  test('home', async ({ page }) => {
    await gotoApp(page, '/');
    await expect(page.locator('main article').first()).toBeVisible();
    await expectNoSeriousA11yViolations(page, '/');
  });

  test('asset detail', async ({ page }) => {
    const asset = pickOthersAsset();
    await gotoApp(page, `/assets/${asset.slug}/`);
    await expect(page.getByRole('heading', { level: 1, name: asset.title })).toBeVisible();
    // The comment composer is lazy-loaded: audit it too.
    await expect(page.locator('[contenteditable="true"].tiptap-prose').first()).toBeEditable();
    await expectNoSeriousA11yViolations(page, '/assets/[slug]');
  });

  test('library', async ({ page }) => {
    await gotoApp(page, '/library/');
    await expect(page.getByRole('heading', { level: 1, name: 'My Library' })).toBeVisible();
    await expect(page.locator('main article').first()).toBeVisible();
    await expectNoSeriousA11yViolations(page, '/library');
  });

  test('search', async ({ page }) => {
    await gotoApp(page, '/search/?q=unity');
    await expect(page.locator('main article').first()).toBeVisible();
    await expectNoSeriousA11yViolations(page, '/search');
  });

  test('admin dashboard', async ({ page }) => {
    await gotoApp(page, '/admin/');
    await expect(page.getByRole('heading', { level: 2, name: 'Downloads (30d)' })).toBeVisible();
    await expectNoSeriousA11yViolations(page, '/admin');
  });
});
