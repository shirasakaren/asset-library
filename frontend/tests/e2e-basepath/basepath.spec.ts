import { test, expect, expectNotFound, shellRoute, type Page } from '../e2e/helpers/test';
import { gotoApp, openProfileMenu } from '../e2e/helpers/app';
import { createDraft } from '../e2e/helpers/publish';
import { pickOthersAsset } from '../e2e/helpers/seed';
import { ORIGIN, PREFIX } from './prefix';

/**
 * Smoke suite for the app served under a sub-path (the GitHub project Pages URL). Run it against
 * an export built with `NEXT_PUBLIC_BASE_PATH=/asset-library` (see playwright.basepath.config.ts).
 *
 * Paths passed to `page.goto` / `gotoApp` have NO leading slash: they resolve against the
 * baseURL (`.../asset-library/`). A leading slash would escape the prefix.
 *
 * The shared guard (helpers/test.ts) fails any page error, console error or HTTP status >= 400,
 * so a URL that lost its prefix (answered by the server's 404 shell) fails the test; the explicit
 * request audit below makes the cause obvious.
 */

/** Collects every same-origin request whose path is outside the prefix (`/_next/...`, `/thumbs/...`). */
function auditEscapes(page: Page): string[] {
  const escapes: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.origin !== ORIGIN) return;
    if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) {
      escapes.push(`${req.resourceType()} ${url.pathname}`);
    }
  });
  return escapes;
}

function expectUnderPrefix(page: Page): void {
  const { pathname } = new URL(page.url());
  expect(
    pathname === PREFIX || pathname.startsWith(`${PREFIX}/`),
    `URL escaped the prefix: ${page.url()}`,
  ).toBe(true);
}

test.describe('base path smoke', () => {
  test('home: cards render, every thumbnail decodes, nothing is requested outside the prefix', async ({
    page,
  }) => {
    const escapes = auditEscapes(page);
    await gotoApp(page, '');
    expect(new URL(page.url()).pathname).toBe(`${PREFIX}/`);

    const cards = page.locator('main article');
    await expect(cards.nth(7)).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(8);

    const imgs = cards.locator('img');
    await expect(async () => {
      const n = Math.min(await cards.count(), 8);
      for (let i = 0; i < n; i++) await cards.nth(i).scrollIntoViewIfNeeded();
      const imgInfo = await imgs.evaluateAll((els) =>
        els.slice(0, 8).map((el) => {
          const img = el as HTMLImageElement;
          return { src: new URL(img.currentSrc || img.src).pathname, w: img.naturalWidth };
        }),
      );
      expect(imgInfo.length).toBeGreaterThanOrEqual(8);
      for (const i of imgInfo) {
        expect(i.src.startsWith(`${PREFIX}/thumbs/`), `thumbnail src ${i.src}`).toBe(true);
        expect(i.w, i.src).toBeGreaterThan(0);
      }
    }).toPass();

    expect(escapes, 'requests outside the base path').toEqual([]);
  });

  test('the library and an asset detail page hard-load under the prefix', async ({ page }) => {
    const escapes = auditEscapes(page);
    const lib = await page.goto('library/');
    expect(lib?.status()).toBe(200);
    await expect(page.locator('main').first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

    const asset = pickOthersAsset();
    const res = await page.goto(`assets/${asset.slug}/`);
    expect(res?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(`${PREFIX}/assets/${asset.slug}/`);
    await expect(page.getByRole('heading', { level: 1, name: asset.title })).toBeVisible();
    // The cover image of the gallery is a seeded /thumbs/ URL.
    const cover = page.locator('main img[src*="/thumbs/"]').first();
    await expect(cover).toBeVisible();
    await expect
      .poll(() => cover.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    expect(escapes, 'requests outside the base path').toEqual([]);
  });

  test('clicking through the app keeps the prefix', async ({ page }) => {
    const escapes = auditEscapes(page);
    await gotoApp(page, '');
    const primary = page.getByRole('navigation', { name: 'Primary' });

    await primary.getByRole('link', { name: 'My Library' }).click();
    await expect(page).toHaveURL(`${ORIGIN}${PREFIX}/library/`);
    await page.getByRole('banner').getByRole('link', { name: 'MGM Asset Library home' }).click();
    await expect(page).toHaveURL(`${ORIGIN}${PREFIX}/`);

    // A card opens its detail page; the tabs update the hash without doubling the prefix.
    await page.locator('main article a[href*="/assets/"]').first().click();
    await expect(page).toHaveURL(new RegExp(`^${ORIGIN}${PREFIX}/assets/[^/]+/$`));
    expectUnderPrefix(page);
    await page.getByRole('tab', { name: 'Versions' }).click();
    await expect(page).toHaveURL(new RegExp(`^${ORIGIN}${PREFIX}/assets/[^/]+/#versions$`));

    // The breadcrumb leads back to the (prefixed) home page.
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link').first().click();
    await expect(page).toHaveURL(`${ORIGIN}${PREFIX}/`);

    // A footer link (a plain anchor before the fix).
    await page.getByRole('contentinfo').getByRole('link', { name: 'Library', exact: true }).click();
    await expect(page).toHaveURL(`${ORIGIN}${PREFIX}/library/`);
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'About' })
      .click();
    await expect(page).toHaveURL(`${ORIGIN}${PREFIX}/about/`);
    expectUnderPrefix(page);
    expect(escapes, 'requests outside the base path').toEqual([]);
  });

  test('an admin table row opens its detail page under the prefix', async ({ page }) => {
    await gotoApp(page, 'admin/reports/');
    const row = page.locator('tbody tr').first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(new RegExp(`^${ORIGIN}${PREFIX}/admin/reports/[^/]+/?$`));
    await expect(page.getByRole('banner').first()).toBeVisible();
  });

  test('brand assets, favicon and pattern tiles are served under the prefix', async ({ page }) => {
    const escapes = auditEscapes(page);
    await gotoApp(page, '');

    // Header logo (next/image, unoptimized: not prefixed by Next itself).
    const logo = page.getByRole('banner').getByRole('img', { name: 'MGM' }).first();
    await expect(logo).toHaveAttribute('src', `${PREFIX}/brand/mgm-logo.svg`);
    await expect
      .poll(() => logo.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);

    // Direct fetches under the prefix answer 200 with the right type.
    const logoRes = await page.request.get('brand/mgm-logo.svg');
    expect(logoRes.status()).toBe(200);
    expect(logoRes.headers()['content-type']).toContain('image/svg+xml');

    // The favicon <link> points below the prefix and resolves.
    const iconHref = await page.locator('link[rel~="icon"]').first().getAttribute('href');
    expect(iconHref).toBe(`${PREFIX}/brand/favicon.svg`);
    expect((await page.request.get(iconHref!)).status()).toBe(200);

    // Pattern tiles (the geometric footer strip / empty states), when the page has any.
    const tiles = page.locator('img[src*="/patterns/"]');
    const count = await tiles.count();
    for (let i = 0; i < count; i++) {
      await expect(tiles.nth(i)).toHaveAttribute(
        'src',
        new RegExp(`^${PREFIX}/patterns/p-\\d+\\.svg$`),
      );
    }
    expect((await page.request.get('patterns/p-1.svg')).status()).toBe(200);

    // The thumbnail manifest the deploy check requests.
    expect((await page.request.get('thumbs/manifest.json')).status()).toBe(200);
    // Outside the prefix there is nothing (this is the 404 shell, as on Pages).
    expect((await page.request.get('/brand/mgm-logo.svg')).status()).toBe(404);
    expect(escapes, 'requests outside the base path').toEqual([]);
  });

  test('downloading a file of a seeded asset still works', async ({ page }) => {
    const asset = pickOthersAsset(1);
    await gotoApp(page, `assets/${asset.slug}/`);
    await page.getByRole('button', { name: 'Download', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: /\.\w+/ }).first().click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.\w+$/);
    await expect(dialog.getByText('Thank you for downloading.')).toBeVisible();
  });

  test('Reset demo data reloads onto the prefixed home page', async ({ page }) => {
    await gotoApp(page, 'library/');
    const menu = await openProfileMenu(page);
    await menu.getByRole('button', { name: 'Reset demo data' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reset demo data?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page).toHaveURL(`${ORIGIN}${PREFIX}/`);
    await expect(page.getByRole('region', { name: 'Demo notice' })).toBeVisible();
  });
});

// The 404 shell: ids created in the browser have no HTML file. GitHub project Pages answers the
// document request for /asset-library/publish/<id>/ with the repo-root 404.html (status 404), and
// the client renders the real route: usePathname() excludes the base path, so the shell must still
// match its dynamic routes.
test.describe('404 shell under the prefix', () => {
  test.use(expectNotFound(shellRoute(`${PREFIX}/publish/:id`)));

  test('a draft created in the browser opens on a hard load', async ({ page }) => {
    const title = 'Base Path Hard Load Draft';
    const id = await createDraft(page, { title });
    expect(new URL(page.url()).pathname).toMatch(new RegExp(`^${PREFIX}/publish/${id}/?$`));

    const res = await page.goto(`publish/${id}/`);
    expect(res?.status(), 'the host has no HTML file for a new id').toBe(404);
    await expect(page.getByRole('navigation', { name: 'Publish steps' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole('banner').first()).toBeVisible();
    expectUnderPrefix(page);
  });
});
