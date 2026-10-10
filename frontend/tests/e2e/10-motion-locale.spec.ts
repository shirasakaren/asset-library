import { test, expect } from './helpers/test';
import { gotoApp } from './helpers/app';
import { seedCategories } from './helpers/seed';
import id from '../../messages/id.json';

/** The carousel advances every 5 s (ROTATE_MS in featured-carousel.tsx). */
const AFTER_ONE_ROTATION_MS = 6_000;

test.describe('reduced motion', () => {
  // A controllable clock instead of real waiting: the test jumps past the rotation interval.
  test('the featured carousel rotates by itself', async ({ page }) => {
    await page.clock.install();
    await gotoApp(page, '/');
    const headline = page
      .getByRole('region', { name: 'Featured' })
      .getByRole('heading', { level: 2 });
    await expect(headline).toBeVisible();
    const first = await headline.innerText();

    await page.clock.fastForward(AFTER_ONE_ROTATION_MS);
    await expect(headline).not.toHaveText(first);
  });

  test('prefers-reduced-motion stops the autoplay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install();
    await gotoApp(page, '/');
    const headline = page
      .getByRole('region', { name: 'Featured' })
      .getByRole('heading', { level: 2 });
    await expect(headline).toBeVisible();
    const first = await headline.innerText();

    // Several rotation intervals pass; with reduced motion the slide must not change...
    await page.clock.fastForward(AFTER_ONE_ROTATION_MS);
    await page.clock.fastForward(AFTER_ONE_ROTATION_MS);
    await expect(headline).toHaveText(first);

    // ...but manual navigation still works.
    await page.getByRole('button', { name: 'Next featured asset' }).click();
    await expect(headline).not.toHaveText(first);
  });
});

test.describe('locale', () => {
  test('Indonesian strings on the key pages and for the category names', async ({ page }) => {
    await gotoApp(page, '/');
    await page.getByRole('button', { name: 'Language' }).click();
    await page.getByRole('button', { name: /Bahasa Indonesia/ }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');

    // Navigation and category names on the home page.
    await expect(
      page
        .getByRole('navigation', { name: 'Primary' })
        .getByRole('link', { name: id.nav.discover }),
    ).toBeVisible();
    const category = seedCategories()[0]!;
    await expect(page.getByText(category.name.id).first()).toBeVisible();

    // Other pages (hard loads: the choice is read from storage).
    const pages: [string, string][] = [
      ['/publish/', id.publish.title],
      ['/library/', id.library.title],
      ['/notifications/', id.notif.heading],
    ];
    for (const [path, heading] of pages) {
      await gotoApp(page, path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    }
  });
});
