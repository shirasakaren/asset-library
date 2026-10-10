import { test, expect } from './helpers/test';
import { gotoApp } from './helpers/app';
import { publishedAssets, seedAssets, pickOthersAsset } from './helpers/seed';
import type { Page } from '@playwright/test';

/** A toast with this text (the live region may repeat it, hence `.first()`). */
const toast = (page: Page, text: string | RegExp) => page.getByText(text).first();

test.describe('admin: dashboard and assets', () => {
  test('the dashboard shows the catalog numbers and renders its charts', async ({ page }) => {
    await gotoApp(page, '/admin/');
    await expect(page.getByRole('heading', { level: 1, name: 'Admin' })).toBeVisible();

    const all = seedAssets();
    const count = (s: string) => all.filter((a) => a.status === s).length;
    await expect(page.getByRole('link', { name: `Published ${count('PUBLISHED')}` })).toBeVisible();
    await expect(page.getByRole('link', { name: `Drafts ${count('DRAFT')}` })).toBeVisible();
    await expect(page.getByRole('link', { name: `Archived ${count('ARCHIVED')}` })).toBeVisible();

    // Four charts with real axes (dates and numbers), not empty placeholders.
    for (const heading of [
      'Downloads (30d)',
      'Publishes (30d)',
      'New users (30d)',
      'Storage by bucket',
    ]) {
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible();
    }
    const charts = page.getByRole('img').filter({ hasText: /\d/ });
    await expect(charts).toHaveCount(4);
  });

  test('an asset can be archived and restored from the assets list', async ({ page }) => {
    const asset = pickOthersAsset(4);
    await gotoApp(page, '/admin/assets/');
    await page.getByRole('searchbox', { name: /Search title/ }).fill(asset.slug);
    const row = page.getByRole('row').filter({ hasText: asset.title });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('PUBLISHED');

    await row.getByRole('button', { name: 'Row actions' }).click();
    await page.getByRole('menuitem', { name: 'Archive' }).click();
    await expect(toast(page, `Archived ${asset.title}`)).toBeVisible();
    await expect(row).toContainText('ARCHIVED');

    await row.getByRole('button', { name: 'Row actions' }).click();
    await page.getByRole('menuitem', { name: 'Restore' }).click();
    await expect(toast(page, `Restored ${asset.title}`)).toBeVisible();
    await expect(row).toContainText('PUBLISHED');
  });

  test('status filters list only matching assets', async ({ page }) => {
    await gotoApp(page, '/admin/assets/');
    await page.getByRole('button', { name: /^Archived/ }).click();
    await expect(page).toHaveURL(/status=ARCHIVED/);
    const rows = page.getByRole('row').filter({ hasText: 'ARCHIVED' });
    await expect(rows.first()).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'PUBLISHED' })).toHaveCount(0);
  });
});

test.describe('admin: featured', () => {
  test('the 6th active slot is refused; freeing one lets a new asset in', async ({ page }) => {
    const candidate = publishedAssets().find(
      (a) => a.id !== 'a-ucupaint' && a.slug !== 'factory-kit',
    )!;
    await gotoApp(page, '/admin/featured/');
    await expect(page.getByText('5 / 5 active')).toBeVisible();

    const add = async () => {
      await page.getByRole('button', { name: 'Feature an asset' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByPlaceholder(/Search a published asset/).fill(candidate.slug);
      await dialog
        .getByRole('button', { name: new RegExp(candidate.slug) })
        .first()
        .click();
      await dialog.getByRole('button', { name: 'Add', exact: true }).click();
      return dialog;
    };

    // Beyond the cap: a clear error, the modal stays open, nothing was added.
    const dialog = await add();
    await expect(toast(page, /Maximum 5 active featured slots/)).toBeVisible();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('5 / 5 active')).toBeVisible();

    // Delete one slot, then the same add succeeds.
    await page.getByRole('button', { name: 'Delete' }).first().click();
    await expect(toast(page, 'Slot deleted')).toBeVisible();
    await expect(page.getByText('4 / 5 active')).toBeVisible();
    await add();
    await expect(toast(page, 'Slot added')).toBeVisible();
    await expect(page.getByText('5 / 5 active')).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: candidate.title })).toBeVisible();
  });

  test('dragging a slot changes the order and it persists', async ({ page }) => {
    await gotoApp(page, '/admin/featured/');
    const titles = () => page.getByRole('main').getByRole('heading', { level: 3 }).allInnerTexts();
    await expect(page.getByRole('main').getByRole('heading', { level: 3 })).toHaveCount(5);
    const before = await titles();

    const handles = page.getByRole('button', { name: 'Drag to reorder' });
    const from = (await handles.nth(0).boundingBox())!;
    const to = (await handles.nth(2).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    // dnd-kit needs a few intermediate moves to start and track the drag.
    await page.mouse.move(from.x + 40, from.y + 40, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 10, { steps: 15 });
    await page.mouse.up();

    await expect(async () => {
      const after = await titles();
      expect(after).not.toEqual(before);
      expect(after[2]).toBe(before[0]);
    }).toPass();
    const reordered = await titles();

    await page.reload();
    await expect(page.getByRole('main').getByRole('heading', { level: 3 })).toHaveCount(5);
    expect(await titles()).toEqual(reordered);
  });
});

test.describe('admin: categories and tags', () => {
  test('categories with assets cannot be deleted; an empty one can be created and deleted', async ({
    page,
  }) => {
    await gotoApp(page, '/admin/categories/');
    const items = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: 'Edit' }) });
    await expect(items).toHaveCount(10);
    // Every seeded category has assets, so every Delete is disabled.
    const deletes = items.getByRole('button', { name: 'Delete' });
    for (let i = 0; i < 10; i++) await expect(deletes.nth(i)).toBeDisabled();

    await page.getByRole('button', { name: 'New category' }).click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByLabel(/English|\(EN\)/i)
      .first()
      .fill('E2E Temporary');
    await dialog
      .getByLabel(/Indonesian|\(ID\)/i)
      .first()
      .fill('E2E Sementara');
    await dialog.getByRole('button', { name: /^(Save|Create|Add)$/ }).click();

    const created = items.filter({ hasText: 'E2E Temporary' });
    await expect(created).toHaveCount(1);
    await expect(created.getByRole('button', { name: 'Delete' })).toBeEnabled();
    await created.getByRole('button', { name: 'Delete' }).click();
    await expect(items.filter({ hasText: 'E2E Temporary' })).toHaveCount(0);
    await expect(items).toHaveCount(10);
  });

  test('merging two tags repoints their assets and removes the source tag', async ({ page }) => {
    await gotoApp(page, '/admin/tags/');
    await page.getByRole('button', { name: 'Merge tags' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Type a tag…').fill('shader');
    const suggestions = dialog.getByRole('listitem');
    await expect(suggestions.nth(1)).toBeVisible();
    const sourceSlug = (await suggestions.nth(0).locator('code').innerText()).trim();
    const targetSlug = (await suggestions.nth(1).locator('code').innerText()).trim();
    await suggestions.nth(0).getByRole('button', { name: 'From' }).click();
    await suggestions.nth(1).getByRole('button', { name: 'Into' }).click();
    await dialog.getByRole('button', { name: 'Merge', exact: true }).click();
    await expect(toast(page, /Merged 1 tag\(s\) into/)).toBeVisible();

    // The source tag is gone from the table, the target remains.
    const search = page.getByRole('searchbox', { name: 'Search tags' });
    const slugCell = (slug: string) =>
      page
        .getByRole('cell')
        .filter({ has: page.locator('code', { hasText: new RegExp(`^${slug}$`) }) });
    await search.fill(sourceSlug);
    await expect(search).toHaveValue(sourceSlug);
    await expect(slugCell(sourceSlug)).toHaveCount(0);
    await search.fill(targetSlug);
    await expect(slugCell(targetSlug)).toHaveCount(1);
  });
});
