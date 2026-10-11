import { test, expect } from './helpers/test';
import { gotoApp, reloadApp } from './helpers/app';
import { publishedAssets, seedCategories } from './helpers/seed';
import type { Page } from '@playwright/test';

const cards = (page: Page) => page.locator('main article');
const resultCount = (page: Page) => page.getByText(/^\d+ assets?$|^No assets$/);

/** The sort <select> has no label; find it by one of its options. */
const sortSelect = (page: Page) =>
  page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'Most downloaded' }) });

/** Types into the navbar search and follows the typeahead's "See all results" row. */
async function searchFromNavbar(page: Page, text: string) {
  const box = page.getByRole('banner').getByRole('combobox', { name: 'Search' });
  await box.fill(text);
  await page.getByRole('option', { name: `See all results for "${text}"` }).click();
  await expect(page).toHaveURL(new RegExp('/search/?[?]q='));
}

test.describe('search and filters', () => {
  test('searching "unity" lists matching assets with titles', async ({ page }) => {
    await gotoApp(page, '/');
    await searchFromNavbar(page, 'unity');

    await expect(cards(page).first()).toBeVisible();
    const n = await cards(page).count();
    expect(n).toBeGreaterThan(5);
    // Every hit has a visible title link.
    const titles = await cards(page).getByRole('heading').allInnerTexts();
    expect(titles.length).toBe(n);
    expect(titles.every((t) => t.trim().length > 0)).toBe(true);
  });

  test('a query that matches nothing shows the empty state', async ({ page }) => {
    await gotoApp(page, '/search/?q=zzzqqqnothing');
    await expect(page.getByText('No results match your filters.')).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
  });

  test('category and engine filters narrow the results and live in the URL', async ({ page }) => {
    const tools = seedCategories().find((c) => c.id === 'cat-tools')!;
    const expected = publishedAssets().filter(
      (a) => a.categoryId === tools.id && a.engine === 'UNITY',
    ).length;
    expect(expected).toBeGreaterThan(0);

    await gotoApp(page, '/search/');
    await expect(cards(page).first()).toBeVisible();

    const aside = page.getByRole('complementary');
    await aside.getByRole('button', { name: tools.name.en, exact: true }).click();
    await expect(page).toHaveURL(/categoryIds=cat-tools/);
    // URL-driven (controlled) radio: click, then wait for the state to follow the URL.
    await aside.getByRole('radio', { name: 'Unity' }).click();
    await expect(aside.getByRole('radio', { name: 'Unity' })).toBeChecked();
    await expect(page).toHaveURL(/engine=UNITY/);

    await expect(resultCount(page)).toHaveText(`${expected} asset${expected === 1 ? '' : 's'}`);
    // Every card is from the chosen category.
    const categories = await cards(page)
      .locator('.text-caption')
      .filter({ hasText: tools.name.en })
      .count();
    expect(categories).toBe(expected);

    // Filters survive a reload (they are URL state).
    await reloadApp(page);
    await expect(aside.getByRole('radio', { name: 'Unity' })).toBeChecked();
    await expect(aside.getByRole('button', { name: tools.name.en, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(resultCount(page)).toHaveText(`${expected} asset${expected === 1 ? '' : 's'}`);
  });

  test('sorting by most downloaded puts the most downloaded asset first', async ({ page }) => {
    const top = [...publishedAssets()].sort((a, b) => b.totalDownloads - a.totalDownloads)[0]!;
    await gotoApp(page, '/search/');
    await expect(cards(page).first()).toBeVisible();

    await sortSelect(page).selectOption({ label: 'Most downloaded' });
    await expect(page).toHaveURL(/sort=mostDownloaded/);
    await expect(cards(page).first().getByRole('heading')).toHaveText(top.title);

    await sortSelect(page).selectOption({ label: 'Alphabetical' });
    await expect(async () => {
      const titles = await cards(page).getByRole('heading').allInnerTexts();
      const sorted = [...titles].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
      expect(titles.slice(0, 12)).toEqual(sorted.slice(0, 12));
    }).toPass();
  });

  test('scrolling loads further pages of results', async ({ page }) => {
    const total = publishedAssets().length;
    await gotoApp(page, '/search/');
    await expect(cards(page).first()).toBeVisible();
    const first = await cards(page).count();
    expect(first).toBeLessThan(total);

    await expect(async () => {
      await page.mouse.wheel(0, 4000);
      expect(await cards(page).count()).toBeGreaterThan(first);
    }).toPass();

    // Keep scrolling until the end of the catalog.
    await expect(async () => {
      await page.mouse.wheel(0, 8000);
      await expect(page.getByText("You've reached the end of results.")).toBeVisible({
        timeout: 1000,
      });
    }).toPass();
    expect(await cards(page).count()).toBe(total);
  });

  test('an asset with a Japanese original title is found by that title', async ({ page }) => {
    const asset = publishedAssets().find((a) => a.originalTitle)!;
    expect(asset, 'the seed has at least one asset with an originalTitle').toBeTruthy();

    await gotoApp(page, '/');
    const box = page.getByRole('banner').getByRole('combobox', { name: 'Search' });
    await box.fill(asset.originalTitle!);
    // The typeahead already offers the asset under its English title...
    await expect(page.getByRole('option').filter({ hasText: asset.title })).toBeVisible();
    // ...and the full results list has it too.
    await page
      .getByRole('option', { name: `See all results for "${asset.originalTitle}"` })
      .click();
    await expect(page).toHaveURL(new RegExp('/search/?[?]q='));
    await expect(
      cards(page).filter({ has: page.getByRole('heading', { name: asset.title, exact: true }) }),
    ).toBeVisible();
  });
});
