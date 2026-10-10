import { test, expect } from './helpers/test';
import { gotoApp, postComment } from './helpers/app';
import { pickOthersAsset, seedUsers } from './helpers/seed';
import type { Page } from '@playwright/test';

/** The bell badge in the navbar ("N unread"); null when there is none. */
async function bellCount(page: Page): Promise<number> {
  const badge = page.getByRole('banner').getByLabel(/^\d+ unread$/);
  if ((await badge.count()) === 0) return 0;
  return Number((await badge.first().getAttribute('aria-label'))!.split(' ')[0]);
}

test.describe('social', () => {
  test('the owner of someone else’s asset replies to my comment, live, with a notification', async ({
    page,
  }) => {
    const asset = pickOthersAsset(3);
    const owner = seedUsers().find((u) => u.id === asset.ownerId)!;

    await gotoApp(page, `/assets/${asset.slug}/`);
    await expect(page.getByRole('banner').getByLabel(/^\d+ unread$/)).toBeVisible();
    const before = await bellCount(page);
    expect(before).toBeGreaterThan(0);

    await postComment(page, 'Thank you, this is really useful for my project.');

    // The simulated reply arrives ~6 s later without any reload. The thread announces it
    // ("1 new comments") and shows it, written by the asset owner and addressed to the persona...
    const banner = page.getByRole('button', { name: /new comments?. Click to see them/ });
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await banner.click();
    const reply = page
      .getByRole('article')
      .filter({ hasText: owner.displayName })
      .filter({ hasText: 'Aria' });
    await expect(reply.first()).toBeVisible();

    // ...and the bell goes up by one.
    await expect(async () => {
      expect(await bellCount(page)).toBe(before + 1);
    }).toPass({ timeout: 5_000 });
  });

  test('notifications: opening one marks it read, mark all as read clears the bell', async ({
    page,
  }) => {
    await gotoApp(page, '/notifications/');
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();

    const unreadDots = page.getByLabel('Unread', { exact: true });
    await expect(unreadDots.first()).toBeVisible();
    const total = await unreadDots.count();
    const bellBefore = await bellCount(page);
    expect(total).toBeGreaterThan(1);
    expect(bellBefore).toBe(total);

    // Open one unread notification (it navigates to its target)...
    const row = page.getByRole('link').filter({ has: unreadDots }).first();
    await row.click();
    await expect(page).not.toHaveURL(/\/notifications\/?$/);

    // ...and it is read when we come back: one fewer unread, the bell agrees.
    await gotoApp(page, '/notifications/');
    await expect(unreadDots).toHaveCount(total - 1);
    await expect(async () => {
      expect(await bellCount(page)).toBe(total - 1);
    }).toPass();

    // Mark all as read.
    await page.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(unreadDots).toHaveCount(0);
    await expect(page.getByRole('banner').getByLabel(/^\d+ unread$/)).toHaveCount(0);

    // It sticks after a reload.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
    await expect(unreadDots).toHaveCount(0);
    await expect(page.getByRole('banner').getByLabel(/^\d+ unread$/)).toHaveCount(0);
  });
});
