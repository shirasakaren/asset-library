import { test, expect } from './helpers/fixtures';

test('full report flow: user reports → admin actions ARCHIVE_ASSET', async ({ browser }) => {
  const userCtx = await browser.newContext({ storageState: 'tests/e2e/auth-states/user.json' });
  const adminCtx = await browser.newContext({ storageState: 'tests/e2e/auth-states/admin.json' });
  try {
    const u = await userCtx.newPage();
    await u.goto('/');
    await u.locator('article a').first().click();
    await u.waitForURL(/\/assets\//);

    await u.getByRole('button', { name: /^report$/i }).click();
    await u.getByLabel(/malicious/i).check();
    await u.getByLabel(/what did you notice/i).fill('E2E malicious-file report.');
    await u.getByRole('button', { name: /submit report/i }).click();
    await expect(u.getByText(/report submitted/i)).toBeVisible({ timeout: 10_000 });

    // Admin reviews
    const a = await adminCtx.newPage();
    await a.goto('/admin/reports?status=OPEN');
    await a.locator('tr', { hasText: 'E2E malicious' }).first().click().catch(() => undefined);
    await a.waitForURL(/\/admin\/reports\/[\w-]+/);
    await a.getByLabel(/^archive asset$/i).check();
    await a.getByLabel(/admin notes/i).fill('Verified malicious. Archiving.');
    await a.getByRole('button', { name: /submit decision/i }).click();

    await a.waitForURL(/\/admin\/reports/);
  } finally {
    await userCtx.close();
    await adminCtx.close();
  }
});
