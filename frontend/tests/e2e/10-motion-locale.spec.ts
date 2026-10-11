import { test, expect, type Page } from './helpers/test';
import { gotoApp } from './helpers/app';
import { seedCategories } from './helpers/seed';
import id from '../../messages/id.json';

/** The carousel advances every 5 s (ROTATE_MS in featured-carousel.tsx). */
const AFTER_ONE_ROTATION_MS = 6_000;

/**
 * Index of the active slide, read from the carousel's slide indicator
 * (`role=tab`, `aria-selected`, label "Go to slide N").
 */
async function activeSlide(page: Page): Promise<number> {
  const region = page.getByRole('region', { name: 'Featured' });
  const label = await region.getByRole('tab', { selected: true }).getAttribute('aria-label');
  return Number(/(\d+)$/.exec(label ?? '')?.[1]) - 1;
}

test.describe('carousel autoplay', () => {
  // A controllable clock instead of real waiting: the test jumps past the rotation interval.
  test('without reduced motion the featured carousel advances by itself (control)', async ({
    page,
  }) => {
    await page.clock.install();
    await gotoApp(page, '/');
    await expect(page.getByRole('region', { name: 'Featured' })).toBeVisible();
    expect(await activeSlide(page)).toBe(0);

    await page.clock.fastForward(AFTER_ONE_ROTATION_MS);
    await expect.poll(() => activeSlide(page)).toBe(1);
  });

  test('prefers-reduced-motion keeps the carousel on its first slide, manual navigation still works', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install();
    await gotoApp(page, '/');
    await expect(page.getByRole('region', { name: 'Featured' })).toBeVisible();
    expect(await activeSlide(page)).toBe(0);

    // Three rotation intervals pass on the fake clock. The slide must stay on 0 for a real
    // observation window; `not.toPass` fails if it moves at any poll (the control test above
    // proves the same steps DO advance it without reduced motion).
    for (let i = 0; i < 3; i++) await page.clock.fastForward(AFTER_ONE_ROTATION_MS);
    await expect(async () => {
      expect(await activeSlide(page)).not.toBe(0);
    }).not.toPass({ timeout: 2_000, intervals: [100] });

    await page.getByRole('button', { name: 'Next featured asset' }).click();
    await expect.poll(() => activeSlide(page)).toBe(1);
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
