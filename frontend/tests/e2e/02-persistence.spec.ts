import { test, expect } from './helpers/test';
import { detailSaveButton, gotoApp, openProfileMenu, postComment, reloadApp } from './helpers/app';
import { pickOthersAsset } from './helpers/seed';

test.describe('persistence across reloads', () => {
  test('a saved asset shows in the library and survives a reload', async ({ page }) => {
    const asset = pickOthersAsset();
    await gotoApp(page, `/assets/${asset.slug}/`);
    await expect(page.getByRole('heading', { level: 1, name: asset.title })).toBeVisible();

    await detailSaveButton(page, 'Save').click();
    await expect(detailSaveButton(page, 'Saved')).toBeVisible();

    await gotoApp(page, '/library/');
    await expect(page.getByRole('link', { name: asset.title }).first()).toBeVisible();

    await reloadApp(page);
    await expect(page.getByRole('link', { name: asset.title }).first()).toBeVisible();

    // ...and the asset page still reports it as saved after a hard load.
    await gotoApp(page, `/assets/${asset.slug}/`);
    await expect(detailSaveButton(page, 'Saved')).toBeVisible();
  });

  test('a posted comment survives a reload', async ({ page }) => {
    const asset = pickOthersAsset(1);
    const text = `E2E persistence comment ${Date.now()}`;
    await gotoApp(page, `/assets/${asset.slug}/`);
    await postComment(page, text);

    await reloadApp(page);
    await expect(page.getByText(text)).toBeVisible();
  });
});

test.describe('locale', () => {
  test('the Indonesian UI choice survives a reload', async ({ page }) => {
    await gotoApp(page, '/');
    await page.getByRole('button', { name: 'Language' }).click();
    await page.getByRole('button', { name: /Bahasa Indonesia/ }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');
    await expect(
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Jelajah' }),
    ).toBeVisible();

    await reloadApp(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');
    await expect(
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Jelajah' }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Pemberitahuan demo' })).toBeVisible();
  });
});

test.describe('reset demo data', () => {
  test('restores the seed: comment, saved asset and banner dismissal are gone, the locale choice stays', async ({
    page,
  }) => {
    const asset = pickOthersAsset(2);
    const text = `E2E reset comment ${Date.now()}`;

    // Make changes: save, comment, dismiss the banner, switch to Indonesian.
    await gotoApp(page, `/assets/${asset.slug}/`);
    await detailSaveButton(page, 'Save').click();
    await expect(detailSaveButton(page, 'Saved')).toBeVisible();
    await postComment(page, text);
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByRole('region', { name: 'Demo notice' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Language' }).click();
    await page.getByRole('button', { name: /Bahasa Indonesia/ }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');

    // Reset through the profile menu and confirm (the UI is Indonesian now).
    const menu = await openProfileMenu(page);
    await menu.getByRole('button', { name: 'Setel ulang data demo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Setel ulang data demo?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Setel ulang', exact: true }).click();

    // The app reloads onto the home page; the banner is back.
    await expect(page).toHaveURL(/\/$/);
    const banner = page.getByRole('region', { name: 'Pemberitahuan demo' });
    await expect(banner).toBeVisible();

    // The language preference is a browser-level setting and is kept by design.
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');

    // The comment and the saved asset are gone.
    await gotoApp(page, `/assets/${asset.slug}/`);
    await expect(page.getByRole('heading', { level: 1, name: asset.title })).toBeVisible();
    await expect(page.getByText(text)).toHaveCount(0);
    await expect(detailSaveButton(page, 'Simpan')).toBeVisible();
  });
});
