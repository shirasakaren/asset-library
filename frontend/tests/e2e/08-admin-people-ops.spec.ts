import { test, expect } from './helpers/test';
import { gotoApp } from './helpers/app';
import { seedUsers } from './helpers/seed';
import type { Page } from '@playwright/test';

const toast = (page: Page, text: string | RegExp) => page.getByText(text).first();
const email = (displayName: string) =>
  `${displayName.toLowerCase().replace(/ /g, '.')}@preview.example`;

/** Promote a regular user through the modal on /admin/users/. */
async function promote(page: Page, name: string) {
  await page.getByRole('button', { name: 'Promote admin' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('Name or email').fill(name);
  await dialog.getByRole('button', { name: new RegExp(name) }).click();
  await dialog.getByLabel('Type their email to confirm').fill(email(name));
  await dialog.getByRole('button', { name: 'Promote', exact: true }).click();
  await expect(toast(page, `${name} promoted to admin`)).toBeVisible();
}

/** Demote an admin from the table; returns the dialog for further assertions. */
async function openDemote(page: Page, name: string) {
  const row = page.getByRole('row').filter({ hasText: name });
  await row.getByRole('button', { name: 'Demote' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Type their email to confirm').fill(email(name));
  return dialog;
}

test.describe('admin: users', () => {
  test('promote a user, demote them again, and both show in the audit log', async ({ page }) => {
    const user = seedUsers().find((u) => u.role === 'user')!;
    await gotoApp(page, '/admin/users/');
    const row = page.getByRole('row').filter({ hasText: user.displayName });
    await expect(row).toContainText('User');

    await promote(page, user.displayName);
    await expect(row).toContainText('Admin');

    const dialog = await openDemote(page, user.displayName);
    await dialog.getByRole('button', { name: 'Demote', exact: true }).click();
    await expect(toast(page, `${user.displayName} demoted to user`)).toBeVisible();
    await expect(row.getByRole('button', { name: 'Demote' })).toHaveCount(0);

    // Both actions were audited, newest first, with the persona as the actor.
    await gotoApp(page, '/admin/audit/');
    const audit = page.getByRole('list').getByRole('button');
    await expect(audit.first()).toContainText('user.demote');
    await expect(audit.first()).toContainText(user.id);
    await expect(audit.nth(1)).toContainText('user.promote');
    await expect(audit.nth(1)).toContainText('Aria Wijaya');
  });

  test('demoting yourself is refused with a friendly message; the last admin is protected', async ({
    page,
  }) => {
    await gotoApp(page, '/admin/users/');
    await page.getByRole('button', { name: 'Admins only' }).click();

    // Yourself (other admins exist): friendly refusal, still an admin.
    let dialog = await openDemote(page, 'Aria Wijaya');
    await dialog.getByRole('button', { name: 'Demote', exact: true }).click();
    await expect(toast(page, /you can't demote yourself/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Aria Wijaya' })).toContainText('Admin');

    // Demote the other two admins; the last one left cannot be demoted.
    for (const name of ['Kenji Matsuda', 'Siti Rahmawati']) {
      dialog = await openDemote(page, name);
      await dialog.getByRole('button', { name: 'Demote', exact: true }).click();
      await expect(toast(page, `${name} demoted to user`)).toBeVisible();
    }
    dialog = await openDemote(page, 'Aria Wijaya');
    await dialog.getByRole('button', { name: 'Demote', exact: true }).click();
    await expect(dialog.getByText('Cannot demote the last remaining admin.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Aria Wijaya' })).toContainText('Admin');
  });
});

test.describe('admin: moderation queues', () => {
  test('an open report can be dismissed with a note and is then listed as dismissed', async ({
    page,
  }) => {
    await gotoApp(page, '/admin/reports/?status=OPEN');
    const open = page.getByRole('row').filter({ hasText: 'OPEN' });
    await expect(open.first()).toBeVisible();
    const openCount = await open.count();
    await open.first().click();

    // Detail page: decision form.
    await expect(page.getByRole('heading', { level: 1, name: /^Report #/ })).toBeVisible();
    await page.getByLabel('Admin notes').fill('Checked, the listing is fine.');
    await page.getByRole('main').getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(toast(page, 'Report dismissed')).toBeVisible();

    // One fewer open report, one more dismissed.
    await gotoApp(page, '/admin/reports/?status=OPEN');
    await expect(page.getByRole('row').filter({ hasText: 'OPEN' })).toHaveCount(openCount - 1);
    await gotoApp(page, '/admin/reports/?status=DISMISSED');
    await expect(page.getByRole('row').filter({ hasText: 'DISMISSED' }).first()).toBeVisible();

    await gotoApp(page, '/admin/audit/');
    await expect(page.getByRole('list').getByRole('button').first()).toContainText(
      'report.dismiss',
    );
  });

  test('a sourcing request can be approved and rejecting needs a comment', async ({ page }) => {
    await gotoApp(page, '/admin/requests/?status=SENT');
    const sent = page.getByRole('row').filter({ hasText: 'SENT' });
    await expect(sent.first()).toBeVisible();
    const sentCount = await sent.count();
    await sent.first().click();

    await expect(page.getByRole('heading', { level: 1, name: /^Request #/ })).toBeVisible();
    // Rejecting without a comment is refused client-side.
    await page.getByRole('radio', { name: 'REJECTED' }).check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(toast(page, 'A comment is required when rejecting.')).toBeVisible();

    await page.getByRole('radio', { name: 'APPROVED' }).check();
    await page.getByLabel('Admin comment').fill('Added to the sourcing list.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(toast(page, 'Saved')).toBeVisible();

    await gotoApp(page, '/admin/requests/?status=SENT');
    await expect(page.getByRole('row').filter({ hasText: 'SENT' })).toHaveCount(sentCount - 1);
    await gotoApp(page, '/admin/requests/?status=APPROVED');
    await expect(page.getByRole('row').filter({ hasText: 'APPROVED' }).first()).toBeVisible();
  });
});

test.describe('admin: every page loads', () => {
  const PAGES = [
    ['Dashboard', '/admin/', 'Admin'],
    ['Assets', '/admin/assets/', 'Assets'],
    ['Featured', '/admin/featured/', 'Featured'],
    ['Categories', '/admin/categories/', 'Categories'],
    ['Tags', '/admin/tags/', 'Tags'],
    ['Licenses', '/admin/licenses/', 'Licenses'],
    ['Reports', '/admin/reports/', 'Reports'],
    ['Requests', '/admin/requests/', 'Asset requests'],
    ['Storage', '/admin/storage/', 'Storage'],
    ['Users', '/admin/users/', 'Users'],
    ['Audit log', '/admin/audit/', 'Audit log'],
    ['Webhooks', '/admin/webhooks/', 'Webhook deliveries'],
  ] as const;

  test('every sidebar link opens a page with content and no error state', async ({ page }) => {
    await gotoApp(page, '/admin/');
    const sidebar = page.getByRole('complementary', { name: 'Admin sections' });
    await expect(sidebar.getByRole('link')).toHaveCount(PAGES.length);

    for (const [label, path, heading] of PAGES) {
      await sidebar.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      const main = page.getByRole('main');
      // No error / retry state and no forbidden screen (the audit page's own info notice is fine).
      await expect(main.getByRole('button', { name: /try again/i })).toHaveCount(0);
      await expect(main.getByText(/something went wrong|forbidden/i)).toHaveCount(0);
      // Lists have rows, dashboards have cards: the page is not empty.
      await expect(page.getByRole('main').locator('table, ul, article, svg').first()).toBeVisible();
    }
  });
});
