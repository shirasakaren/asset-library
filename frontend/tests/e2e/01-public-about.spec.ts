import { test, expect, ROUTES } from './helpers/fixtures';
import { checkA11y } from './helpers/axe';

test.use({ storageState: undefined });

test('anon user can read /about and click Sign in', async ({ page }) => {
  await page.goto(ROUTES.about);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/Internal use only/i)).toBeVisible();

  const sign = page.getByRole('link', { name: /sign in/i }).first();
  await expect(sign).toBeVisible();

  await checkA11y(page, '/about');

  await Promise.all([
    page.waitForURL((url) => /\/auth\/signin/.test(url.pathname) || /keycloak|realms/i.test(url.host)),
    sign.click(),
  ]);
});
