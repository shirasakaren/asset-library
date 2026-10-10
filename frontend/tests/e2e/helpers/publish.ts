import { expect, type Page } from '@playwright/test';
import { gotoApp } from './app';

export interface DraftInput {
  title: string;
  /** Radio label on the form, default Unity. */
  engine?: string;
}

/**
 * Creates a draft through /publish/new/ with the minimum fields (first
 * category and license in the lists) and waits for the wizard to load.
 * Returns the draft's id taken from the resulting `/publish/<id>/` URL.
 */
export async function createDraft(page: Page, input: DraftInput): Promise<string> {
  await gotoApp(page, '/publish/new/');
  await page.getByLabel('Title', { exact: false }).first().fill(input.title);
  if (input.engine) await page.getByRole('radio', { name: input.engine }).check();
  await selectFirstOption(page, 'Category');
  await selectFirstOption(page, 'License');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await page.waitForURL(/\/publish\/(?!new\b)[^/]+\/?$/);
  const id = new URL(page.url()).pathname.split('/').filter(Boolean)[1]!;
  await expect(page.getByRole('navigation', { name: 'Publish steps' })).toBeVisible();
  return id;
}

async function selectFirstOption(page: Page, label: string): Promise<void> {
  const select = page.getByLabel(label, { exact: false });
  // Options load asynchronously; the first real one follows the "—" placeholder.
  await expect(select.locator('option')).not.toHaveCount(1);
  await select.selectOption({ index: 1 });
}

export async function openStep(page: Page, step: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Publish steps' })
    .getByRole('button', { name: step, exact: false })
    .first()
    .click();
}
