import { test as setup, expect } from '@playwright/test';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Logs each test persona into Keycloak via the direct-grant flow and
 * persists their Auth.js session as a Playwright storage state JSON.
 *
 * Required environment for setup to run:
 *   E2E_BASE_URL         — frontend URL under test (defaults to http://localhost:3000)
 *   E2E_KEYCLOAK_ISSUER  — same as KEYCLOAK_ISSUER on the server
 *   E2E_KEYCLOAK_CLIENT  — confidential client id (e.g. mgm-asset-library-web)
 *   E2E_KEYCLOAK_SECRET  — client secret
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 *   E2E_CONTRIB_EMAIL / E2E_CONTRIB_PASSWORD
 *   E2E_USER_EMAIL / E2E_USER_PASSWORD
 *
 * The test realm must allow the "Direct access grants" flow on the client.
 */

const PERSONAS = ['admin', 'contributor', 'user'] as const;
type Persona = (typeof PERSONAS)[number];

interface PersonaCreds {
  email: string;
  password: string;
}

function readCreds(persona: Persona): PersonaCreds | null {
  const PREFIX: Record<Persona, string> = {
    admin: 'E2E_ADMIN',
    contributor: 'E2E_CONTRIB',
    user: 'E2E_USER',
  };
  const email = process.env[`${PREFIX[persona]}_EMAIL`];
  const password = process.env[`${PREFIX[persona]}_PASSWORD`];
  if (!email || !password) return null;
  return { email, password };
}

async function loginViaUi(
  page: import('@playwright/test').Page,
  creds: PersonaCreds,
): Promise<void> {
  // Go to a gated route; the middleware redirects to /auth/signin which
  // immediately bounces to Keycloak's hosted login.
  await page.goto('/');
  await page.locator('input[name="username"], input[id="username"]').fill(creds.email);
  await page.locator('input[name="password"]').fill(creds.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 20_000 }),
    page.locator('button[type="submit"], input[type="submit"]').first().click(),
  ]);
  await expect(page.locator('nav[aria-label="Primary"]')).toBeVisible();
}

for (const persona of PERSONAS) {
  setup(`auth: ${persona}`, async ({ page, context }) => {
    const creds = readCreds(persona);
    if (!creds) {
      setup.skip(true, `E2E creds missing for ${persona}`);
      return;
    }
    await loginViaUi(page, creds);

    const outPath = resolve('tests/e2e/auth-states', `${persona}.json`);
    if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), { recursive: true });
    const state = await context.storageState();
    writeFileSync(outPath, JSON.stringify(state, null, 2), 'utf8');
  });
}

export { PERSONAS };
