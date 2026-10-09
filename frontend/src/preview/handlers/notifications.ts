import type { NotificationItem, NotificationPage, NotificationType } from '@/lib/api/types';
import type { NotificationRecord } from '../records';
import { route, type PreviewContext } from '../router/router';
import { notFound } from '../router/errors';
import { paginate } from '../router/paginate';

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Newest first; `id` ascending as the tiebreak (the seed has equal timestamps), so the order is total. */
const newestFirst = (a: NotificationRecord, b: NotificationRecord) =>
  cmp(b.createdAt, a.createdAt) || cmp(a.id, b.id);

const toItem = (n: NotificationRecord): NotificationItem => ({
  id: n.id,
  type: n.type,
  payload: n.payload,
  readAt: n.readAt,
  createdAt: n.createdAt,
});

/**
 * Adds a notification to the persona's inbox (the only inbox there is) and announces it on
 * the event bus, which makes the bell and the inbox refresh. Used by every handler that
 * simulates someone else acting on the persona's content.
 */
export async function createNotification(
  ctx: PreviewContext,
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<NotificationRecord> {
  const record = await ctx.db.put<NotificationRecord>('notifications', {
    id: ctx.newId('n'),
    type,
    payload,
    readAt: null,
    createdAt: ctx.now().toISOString(),
  });
  ctx.emit({ type: 'notification', notificationId: record.id });
  return record;
}

route('GET', '/notifications', async (req, ctx): Promise<NotificationPage> => {
  const unreadOnly = req.query.get('unreadOnly') === 'true';
  const rows = (await ctx.db.list<NotificationRecord>('notifications'))
    .filter((n) => !unreadOnly || !n.readAt)
    .sort(newestFirst);
  const page = paginate(rows, req.query);
  return { items: page.items.map(toItem), pageInfo: page.pageInfo };
});

route('GET', '/notifications/unread-count', async (_req, ctx) => {
  const rows = await ctx.db.list<NotificationRecord>('notifications');
  return { count: rows.filter((n) => !n.readAt).length };
});

route('POST', '/notifications/{id}/read', async (req, ctx): Promise<NotificationItem> => {
  const id = req.params.id!;
  const row = await ctx.db.get<NotificationRecord>('notifications', id);
  if (!row) throw notFound(`Notification ${id} not found.`, { code: 'notification.not_found' });
  if (row.readAt) return toItem(row);
  const updated = await ctx.db.patch<NotificationRecord>('notifications', id, {
    readAt: ctx.now().toISOString(),
  });
  ctx.emit({ type: 'notification', notificationId: id });
  return toItem(updated);
});

// Bulk read has no single id; the bell only needs the event to refresh its counters, so it is
// announced with an empty id (`refreshNotifications` then finds no "new" item to apply).
route('POST', '/notifications/read-all', async (_req, ctx): Promise<{ updated: number }> => {
  const now = ctx.now().toISOString();
  const unread = (await ctx.db.list<NotificationRecord>('notifications')).filter((n) => !n.readAt);
  for (const n of unread) {
    await ctx.db.patch<NotificationRecord>('notifications', n.id, { readAt: now });
  }
  if (unread.length > 0) ctx.emit({ type: 'notification', notificationId: '' });
  return { updated: unread.length };
});
