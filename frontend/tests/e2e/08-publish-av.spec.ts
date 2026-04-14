import { test, expect, withStorageState } from './helpers/fixtures';
import { resolve } from 'node:path';

test.use(withStorageState('contributor'));

test('AV-infected upload surfaces banner + acknowledgement gate', async ({ page }) => {
  await page.goto('/publish/new');
  await page.getByLabel(/title/i).first().fill('EICAR test asset');
  await page.locator('select#nd-cat').selectOption({ index: 1 });
  await page.locator('select#nd-lic').selectOption({ index: 1 });
  await page.getByRole('button', { name: /create draft/i }).click();
  await page.waitForURL(/\/publish\/[\w-]+/);

  await page.getByRole('button', { name: /^files$/i }).click();
  await page.setInputFiles(
    'input[type="file"][multiple]:not([webkitdirectory])',
    resolve('tests/fixtures/eicar.com.txt'),
  );

  // The AV banner appears once the backend's analyzer reports INFECTED.
  const banner = page.getByRole('alert').filter({ hasText: /antivirus flagged/i });
  await expect(banner).toBeVisible({ timeout: 45_000 });

  // Acknowledge → Publish becomes possible (the test stops short of the
  // backend approving the publish — that depends on test data setup).
  await page.getByLabel(/i acknowledge the av warning/i).check();
  await expect(page.getByLabel(/i acknowledge the av warning/i)).toBeChecked();
});
