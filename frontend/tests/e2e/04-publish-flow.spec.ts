import { readFileSync } from 'node:fs';
import type { Download, Page } from '@playwright/test';
import { test, expect, expectNotFound, shellRoute } from './helpers/test';
import { gotoApp, reloadApp } from './helpers/app';
import { makePackage, makePng } from './helpers/files';
import { createDraft, openStep } from './helpers/publish';

test.describe('publish wizard', () => {
  // The new draft's wizard URL has no HTML file in the export (404 shell).
  test.use(expectNotFound(shellRoute('/publish/:id')));

  test('cannot publish a draft without a thumbnail and a file', async ({ page }) => {
    await createDraft(page, { title: 'E2E Incomplete Draft' });

    const publish = page.getByRole('button', { name: /^Publish/ });
    await expect(publish).toBeDisabled();
    // The rail names what is missing for the steps that block publishing.
    await expect(page.getByLabel('Blocked: thumbnail')).toBeVisible();
    await expect(page.getByLabel('Blocked: files')).toBeVisible();

    // Review step shows the same gaps.
    await openStep(page, 'Review');
    await expect(page.getByText('No thumbnail yet.')).toBeVisible();
    await expect(page.getByText('No files uploaded.')).toBeVisible();
    await expect(publish).toBeDisabled();
  });
});

test.describe('publish flow', () => {
  // Browser-created ids: the wizard, the published asset page and its analytics page.
  test.use(
    expectNotFound(
      shellRoute('/publish/:id'),
      shellRoute('/assets/e2e-demo-pack'),
      shellRoute('/publish/manage/:id/analytics'),
    ),
  );

  test('draft to published asset: upload, publish, download, persist, manage, analytics', async ({
    page,
  }) => {
    const title = 'E2E Demo Pack';
    const png = makePng();
    const pkg = makePackage(6);

    const id = await createDraft(page, { title });

    // Media: the thumbnail (a real PNG; the wizard recompresses it).
    await openStep(page, 'Media');
    const [thumbChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: /Drop an image here or click to browse/ }).click(),
    ]);
    await thumbChooser.setFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByAltText('Thumbnail preview')).toBeVisible();
    await expect(page.getByLabel('Blocked: thumbnail')).toHaveCount(0);

    // Files: a small package with a recognizable extension.
    await openStep(page, 'Files');
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Browse files' }).click(),
    ]);
    await fileChooser.setFiles({
      name: 'demo-pack.unitypackage',
      mimeType: 'application/octet-stream',
      buffer: pkg,
    });
    await expect(page.getByText('demo-pack.unitypackage')).toBeVisible();
    await expect(page.getByLabel('Blocked: files')).toHaveCount(0);

    // Description.
    await openStep(page, 'Description');
    await page
      .getByLabel('Short description')
      .fill('A tiny package created by the end-to-end suite.');
    const long = page.locator('[contenteditable="true"].tiptap-prose').first();
    await expect(long).toBeEditable();
    await long.fill('Long description written by the e2e suite.');

    // Compatibility.
    await openStep(page, 'Compatibility');
    await page.getByRole('button', { name: 'Add row' }).click();
    await expect(page.getByLabel('Engine version')).toHaveValue(/\S/);

    // Tags.
    await openStep(page, 'Tags');
    const tagInput = page.getByPlaceholder('Add a tag…');
    await tagInput.fill('e2e-demo');
    await tagInput.press('Enter');
    await expect(page.getByRole('button', { name: 'Remove tag e2e-demo' })).toBeVisible();

    // Review, then publish once the analysis finished and the checklist is green.
    await openStep(page, 'Review');
    await expect(page.getByText(/^1 files? · /)).toBeVisible();
    const publish = page.getByRole('button', { name: /^Publish/ });
    await expect(publish).toBeEnabled({ timeout: 15_000 });
    await publish.click();

    // The new asset page.
    await expect(page).toHaveURL(/\/assets\/e2e-demo-pack\/?$/);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(
      page.getByRole('button', { name: new RegExp(`${title}.*lightbox`) }),
    ).toBeVisible();
    await expect(page.getByRole('img', { name: title }).first()).toBeVisible();
    await page.getByRole('tab', { name: 'Package' }).click();
    await expect(page.getByText('demo-pack.unitypackage')).toBeVisible();

    // Download: the browser receives a file with the original name and bytes.
    const download = await downloadFile(page, 'demo-pack.unitypackage');
    expect(download.suggestedFilename()).toBe('demo-pack.unitypackage');
    const path = await download.path();
    expect(readFileSync(path).equals(pkg)).toBe(true);

    // Everything survives a reload (overlay + blob store).
    await reloadApp(page);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole('img', { name: title }).first()).toBeVisible();
    const again = await downloadFile(page, 'demo-pack.unitypackage');
    expect(readFileSync(await again.path()).equals(pkg)).toBe(true);

    // It is in the owner's manage list, and its analytics page renders.
    await gotoApp(page, '/publish/manage/');
    const row = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: title }) });
    await expect(row).toContainText('Published');
    // Both downloads above were counted.
    await expect(row).toContainText('2 downloads');
    await gotoApp(page, `/publish/manage/${id}/analytics/`);
    await expect(page.getByRole('heading', { level: 1, name: 'Asset analytics' })).toBeVisible();
    // The two downloads show up per version (1.0.0) and per source.
    await expect(page.getByRole('row', { name: '1.0.0 2' })).toBeVisible();
  });
});

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Opens the download dialog, picks the file by name and returns the browser download. */
async function downloadFile(page: Page, fileName: string): Promise<Download> {
  await page.getByRole('button', { name: 'Download', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: new RegExp(escapeRegExp(fileName)) }).click(),
  ]);
  await expect(dialog.getByText('Thank you for downloading.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).first().click();
  await expect(dialog).toHaveCount(0);
  return download;
}
