import { test, expect } from './helpers/fixtures';

test('cross-context: comment from user-A surfaces a notification on user-B', async ({ browser }) => {
  const adminCtx = await browser.newContext({ storageState: 'tests/e2e/auth-states/admin.json' });
  const userCtx = await browser.newContext({ storageState: 'tests/e2e/auth-states/user.json' });

  const adminPage = await adminCtx.newPage();
  const userPage = await userCtx.newPage();
  try {
    await adminPage.goto('/');
    const initialBadge = await adminPage.getByLabel(/open notifications/i).innerText().catch(() => '');

    // User comments on an asset the admin owns.
    await userPage.goto('/'); // Discover; the first asset is typically owned by the admin in seed
    await userPage.locator('article a').first().click();
    await userPage.locator('.tiptap-prose').first().fill('Cross-tab notification probe');
    await userPage.getByRole('button', { name: /^post$/i }).first().click();

    // Wait for the WS event to bump the badge on the admin tab.
    await expect.poll(async () => adminPage.getByLabel(/open notifications/i).innerText(), {
      timeout: 15_000,
    }).not.toBe(initialBadge);

    // Open the dropdown — should show the new notification row.
    await adminPage.getByLabel(/open notifications/i).click();
    await expect(adminPage.getByText(/commented on/i).first()).toBeVisible();
  } finally {
    await adminCtx.close();
    await userCtx.close();
  }
});
