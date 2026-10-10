import { test, expect, expectNotFound, shellRoute } from './helpers/test';
import { createDraft } from './helpers/publish';
import { pickOthersAsset, seedUsers } from './helpers/seed';

/**
 * The export is static: only seeded ids are pre-rendered. Ids created in the
 * browser (new drafts) have no HTML file, so the host answers `/404.html` with
 * status 404 and the client-side 404 shell resolves the real route. These
 * tests use hard loads (`page.goto`), the case that exercises that path.
 */
// Exactly the 404 documents this file loads on purpose, nothing broader.
test.use(
  expectNotFound(
    shellRoute('/publish/:id'),
    shellRoute('/assets/no-such-asset-e2e'),
    shellRoute('/definitely/not/here'),
  ),
);

test.describe('dynamic routes', () => {
  test('a seeded asset page is pre-rendered (200) and renders on a hard load', async ({ page }) => {
    const asset = pickOthersAsset();
    const res = await page.goto(`/assets/${asset.slug}/`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: asset.title })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download', exact: true }).first()).toBeVisible();
  });

  test('a draft created in the browser opens on a hard load through the 404 shell', async ({
    page,
  }) => {
    const title = 'E2E Hard Load Draft';
    const id = await createDraft(page, { title });

    // Same page, full document load of the wizard URL.
    const res = await page.goto(`/publish/${id}/`);
    expect(res?.status(), 'the host has no HTML file for a new id').toBe(404);
    await expect(page.getByRole('navigation', { name: 'Publish steps' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    // The shell renders the full app chrome around the page.
    await expect(page.getByRole('banner').first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Demo notice' })).toBeVisible();

    // A brand new tab of the same browser context (shared IndexedDB) sees the same draft.
    const tab = await page.context().newPage();
    await tab.goto(`/publish/${id}`);
    await expect(tab.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await tab.close();
  });

  test('an unknown path shows the 404 page with status 404', async ({ page }) => {
    const res = await page.goto('/definitely/not/here/');
    expect(res?.status()).toBe(404);
    await expect(page.getByText(/we couldn['’]t find that/i)).toBeVisible();
  });

  test('an unknown asset slug shows the not-found state inside the app chrome', async ({
    page,
  }) => {
    const res = await page.goto('/assets/no-such-asset-e2e/');
    expect(res?.status()).toBe(404);
    await expect(page.getByText(/we couldn['’]t find that/i)).toBeVisible();
    await expect(page.getByRole('banner').first()).toBeVisible();
  });

  test('a seeded admin user page renders inside the admin chrome', async ({ page }) => {
    const user = seedUsers().find((u) => u.id !== 'u-persona' && u.role === 'admin')!;
    const res = await page.goto(`/admin/users/${user.id}/`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: user.displayName })).toBeVisible();
    // Admin sidebar is present.
    const sidebar = page.getByRole('complementary', { name: 'Admin sections' });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Users' })).toBeVisible();
  });
});
