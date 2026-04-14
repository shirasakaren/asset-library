import { test, withStorageState, ROUTES } from './helpers/fixtures';

test.use(withStorageState('user'));

test('sign out lands on /about', async ({ page }) => {
  await page.goto(ROUTES.discover);
  await page.getByLabel(/open profile menu/i).click();
  await Promise.all([
    page.waitForURL((url) => url.pathname === ROUTES.about || /keycloak|realms/i.test(url.host)),
    page.getByRole('button', { name: /sign out/i }).click(),
  ]);
});
