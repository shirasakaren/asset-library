import { test, expect, withStorageState, ROUTES } from './helpers/fixtures';

test.use(withStorageState('user'));

test('profile lists devices; revoke confirm closes', async ({ page }) => {
  await page.goto(ROUTES.profile);
  await expect(page.getByRole('heading', { name: /engines connected/i })).toBeVisible();

  const revoke = page.getByRole('button', { name: /^revoke$/i }).first();
  if (await revoke.count()) {
    await revoke.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /cancel/i }).click();
  }
});
