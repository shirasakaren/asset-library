import { expect, type Locator, type Page } from '@playwright/test';

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

/** Opens the profile menu (the avatar button, EN or ID label) and returns the popover. */
export async function openProfileMenu(page: Page): Promise<Locator> {
  await page
    .getByRole('banner')
    .getByRole('button', { name: /open profile menu|buka menu profil/i })
    .first()
    .click();
  const menu = page.getByRole('dialog');
  await expect(menu).toBeVisible();
  return menu;
}

/** A valid 1x1 PNG, enough for the thumbnail uploader. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * The primary Save/Saved toggle of an asset detail page. Scoped to the sidebar
 * (`aside`) because the related-assets cards below carry their own Save buttons.
 */
export function detailSaveButton(page: Page, state: 'Save' | 'Saved'): Locator {
  return page.getByRole('complementary').getByRole('button', { name: state, exact: true });
}

/** Types into the top-level comment composer of an asset page and posts it. */
export async function postComment(page: Page, text: string): Promise<void> {
  // The rich-text editor is lazy-loaded: wait until it is actually editable.
  const composer = page.locator('[contenteditable="true"].tiptap-prose').first();
  await expect(composer).toBeEditable();
  await composer.fill(text);
  await page.getByRole('button', { name: 'Post', exact: true }).first().click();
  await expect(page.getByText(text)).toBeVisible();
}
