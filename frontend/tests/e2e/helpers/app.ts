import { expect, type Page } from '@playwright/test';

/**
 * Navigate to an app path and wait for the app shell (navbar landmark + main
 * content area), not the MeProvider loading skeleton (which has neither).
 * Dismisses nothing: the preview banner stays visible unless a test closes it.
 */
export async function gotoApp(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForShell(page);
}

export async function waitForShell(page: Page): Promise<void> {
  await expect(page.getByRole('banner').first()).toBeVisible();
  await expect(page.locator('main').first()).toBeVisible();
}

/** Reload and wait for the shell again. */
export async function reloadApp(page: Page): Promise<void> {
  await page.reload();
  await waitForShell(page);
}

/** Opens the profile menu in the navbar (the avatar button, EN or ID label). */
export async function openProfileMenu(page: Page): Promise<void> {
  await page
    .getByRole('banner')
    .getByRole('button', { name: /open profile menu|buka menu profil/i })
    .first()
    .click();
}

/** A valid 1x1 PNG, enough for the thumbnail uploader. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
