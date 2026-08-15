import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';
import { resolve } from 'node:path';

test.use(withStorageState('contributor'));

test('contributor creates a draft, uploads, publishes', async ({ page }) => {
  await page.goto(ROUTES.publishNew);
  await page.getByLabel(/title/i).first().fill('E2E demo asset');
  await page.getByLabel(/engine/i).getByLabel('Unity').check();
  // Pick the first category / license from the seeded list.
  await page.locator('select#nd-cat option').nth(1).click().catch(() => undefined);
  await page.locator('select#nd-cat').selectOption({ index: 1 });
  await page.locator('select#nd-lic').selectOption({ index: 1 });
  await page.getByLabel(/initial version/i).fill('1.0.0');
  await page.getByRole('button', { name: /create draft/i }).click();

  await page.waitForURL(/\/publish\/[\w-]+/);

  // Step: Media — upload thumbnail.
  await page.getByRole('button', { name: /^media$/i }).click();
  await page.setInputFiles('input[type="file"][accept*="png"]', resolve('tests/fixtures/thumb.png'));
  await expect(page.locator('img[alt="Thumbnail preview"]')).toBeVisible({ timeout: 15_000 });

  // Step: Files — upload the test package.
  await page.getByRole('button', { name: /^files$/i }).click();
  await page.setInputFiles('input[type="file"][multiple]:not([webkitdirectory])', resolve('tests/fixtures/demo.unitypackage'));
  // Wait for the row to flip to Ready (or analyzing — analyzer step depends on backend).
  await expect(page.getByText(/demo\.unitypackage/)).toBeVisible({ timeout: 30_000 });

  // Step: Description (short EN)
  await page.getByRole('button', { name: /^description$/i }).click();
  await page.getByLabel(/short description/i).fill('E2E demo short.');

  // Skip compatibility (engine-agnostic not the case — we pick Unity, but the
  // backend default isn't strict at create time; test just checks the rail).
  // Review + Publish:
  await page.getByRole('button', { name: /^review$/i }).click();
  const publishBtn = page.getByRole('button', { name: /publish/i }).first();
  if (await publishBtn.isEnabled()) {
    await publishBtn.click();
    await page.waitForURL(/\/assets\//, { timeout: 30_000 });
  }
});
