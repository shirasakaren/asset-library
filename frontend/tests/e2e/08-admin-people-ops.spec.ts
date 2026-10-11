import { test, expect } from './helpers/test';
import { gotoApp } from './helpers/app';
import { seedCategories, seedCount, seedFeatured, seedUsers } from './helpers/seed';
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
  /** A table with at least one data row (header row excluded) holding a real cell. */
  const dataRows = (page: Page) =>
    page
      .getByRole('main')
      .getByRole('row')
      .filter({ has: page.getByRole('cell') });

  /** [sidebar label, path, h1, a check that real data is on the page] */
  const PAGES: [string, string, string, (page: Page) => Promise<void>][] = [
    [
      'Dashboard',
      '/admin/',
      'Admin',
      async (page) => {
        await expect(page.getByRole('link', { name: `Users ${seedCount('users')}` })).toBeVisible();
        await expect(
          page.getByRole('heading', { level: 2, name: 'Downloads (30d)' }),
        ).toBeVisible();
      },
    ],
    [
      'Assets',
      '/admin/assets/',
      'Assets',
      async (page) => expect(dataRows(page).nth(5)).toBeVisible(),
    ],
    [
      'Featured',
      '/admin/featured/',
      'Featured',
      async (page) =>
        expect(page.getByRole('button', { name: 'Drag to reorder' })).toHaveCount(
          seedFeatured().filter((f) => f.isActive).length,
        ),
    ],
    [
      'Categories',
      '/admin/categories/',
      'Categories',
      async (page) => expect(page.getByText(`${seedCategories().length} categories`)).toBeVisible(),
    ],
    ['Tags', '/admin/tags/', 'Tags', async (page) => expect(dataRows(page).nth(5)).toBeVisible()],
    [
      'Licenses',
      '/admin/licenses/',
      'Licenses',
      async (page) => expect(page.getByText(`${seedCount('licenses')} licenses`)).toBeVisible(),
    ],
    [
      'Reports',
      '/admin/reports/',
      'Reports',
      async (page) => expect(dataRows(page).nth(2)).toBeVisible(),
    ],
    [
      'Requests',
      '/admin/requests/',
      'Asset requests',
      async (page) => expect(dataRows(page).nth(2)).toBeVisible(),
    ],
    [
      'Storage',
      '/admin/storage/',
      'Storage',
      async (page) => {
        await expect(page.getByText('Users tracked')).toBeVisible();
        await expect(
          dataRows(page)
            .filter({ hasText: /\d+(\.\d+)? (MB|GB)/ })
            .first(),
        ).toBeVisible();
      },
    ],
    [
      'Users',
      '/admin/users/',
      'Users',
      async (page) => expect(dataRows(page).nth(5)).toBeVisible(),
    ],
    [
      'Audit log',
      '/admin/audit/',
      'Audit log',
      async (page) =>
        expect(page.getByRole('main').getByRole('list').getByRole('button').nth(5)).toBeVisible(),
    ],
    [
      'Webhooks',
      '/admin/webhooks/',
      'Webhook deliveries',
      async (page) =>
        expect(
          dataRows(page)
            .filter({ hasText: /success|failure|pending/ })
            .first(),
        ).toBeVisible(),
    ],
  ];

  test('every sidebar link opens a page with real data and no error state', async ({ page }) => {
    await gotoApp(page, '/admin/');
    const sidebar = page.getByRole('complementary', { name: 'Admin sections' });
    await expect(sidebar.getByRole('link')).toHaveCount(PAGES.length);

    for (const [label, path, heading, hasData] of PAGES) {
      await sidebar.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      const main = page.getByRole('main');
      // No error / retry state and no forbidden screen (the audit page's own info notice is fine).
      await expect(main.getByRole('button', { name: /try again/i })).toHaveCount(0);
      await expect(main.getByText(/something went wrong|forbidden/i)).toHaveCount(0);
      await hasData(page);
    }
  });
});
