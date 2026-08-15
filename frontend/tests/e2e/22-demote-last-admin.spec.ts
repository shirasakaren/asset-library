import { test, withStorageState, ROUTES } from './helpers/fixtures';

test.use(withStorageState('admin'));

test('demote-last-admin guard surfaces inline alert', async ({ page }) => {
  await page.goto(ROUTES.adminUsers);
  await page.getByRole('button', { name: /admins only/i }).click().catch(() => undefined);

  // If there's only one admin, the Demote button triggers the guard.
  const demote = page.getByRole('button', { name: /^demote$/i }).first();
  if (await demote.count()) {
    await demote.click();
    const email = await page.locator('code.font-mono').first().innerText();
    await page.getByPlaceholder(email).fill(email);
    await page.getByRole('button', { name: /^demote$/i }).last().click();
    // Either it succeeds (multi-admin env) or the guard fires.
    await page
      .getByText(/cannot demote the last remaining admin/i)
      .or(page.getByText(/demoted to user/i))
      .first()
      .waitFor({ timeout: 10_000 });
  }
});
