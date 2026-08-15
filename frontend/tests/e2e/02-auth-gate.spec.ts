import { test, expect, ROUTES } from './helpers/fixtures';

test.use({ storageState: undefined });

const GATED = [ROUTES.discover, '/assets/anything', ROUTES.library, ROUTES.search, ROUTES.publish, ROUTES.profile];

for (const path of GATED) {
  test(`anon user is redirected to sign-in from ${path}`, async ({ page }) => {
    const res = await page.goto(path);
    // Either the middleware redirected on the server, or the page rendered
    // the sign-in route.
    await expect(page).toHaveURL((url) => url.pathname.startsWith('/auth/'));
    expect(res?.ok()).toBeTruthy();
  });
}
