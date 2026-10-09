import { describe, it, expect } from 'vitest';
import { FX_OTHER, FX_PERSONA } from '@/preview/test-utils';
import { bus, type PreviewEvent } from '@/preview/events/bus';
import { notifyPersonaOfComment } from '@/preview/handlers/comment-core';
import type { AssetRecord, CommentRecord, NotificationRecord } from '@/preview/records';
import type { MeResponse, NotificationItem, NotificationPage } from '@/lib/api/types';
import { appWith, cm, doc, status } from './social-fixtures';

const notif = (id: string, over: Partial<NotificationRecord> = {}): NotificationRecord => ({
  id,
  type: 'COMMENT_CREATED',
  payload: { assetId: 'a-fx-001', assetSlug: 'fx-001', assetTitle: 'T', commentId: 'c-1' },
  readAt: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  ...over,
});

function collectBus() {
  const events: PreviewEvent[] = [];
  const off = bus.on((e) => events.push(e));
  return { events, off };
}

const notifApp = (rows: NotificationRecord[]) => appWith([], {}, { notifications: rows });

describe('GET /notifications', () => {
  const rows = [
    notif('n-a', { createdAt: '2026-06-01T00:00:00.000Z', readAt: '2026-06-02T00:00:00.000Z' }),
    notif('n-b', { createdAt: '2026-06-03T00:00:00.000Z' }),
    notif('n-c', { createdAt: '2026-06-02T00:00:00.000Z' }),
    notif('n-d', { createdAt: '2026-06-03T00:00:00.000Z' }),
    notif('n-e', { createdAt: '2026-06-04T00:00:00.000Z', readAt: '2026-06-05T00:00:00.000Z' }),
  ];

  it('lists newest first (ties by id) in the NotificationItem shape', async () => {
    const app = await notifApp(rows);
    const r = await app.call<NotificationPage>('GET', '/notifications');
    expect(r.items.map((n) => n.id)).toEqual(['n-e', 'n-b', 'n-d', 'n-c', 'n-a']);
    expect(r.pageInfo).toEqual({ nextCursor: null, hasMore: false });
    expect(r.items[0]).toEqual({
      id: 'n-e',
      type: 'COMMENT_CREATED',
      payload: rows[4]!.payload,
      readAt: '2026-06-05T00:00:00.000Z',
      createdAt: '2026-06-04T00:00:00.000Z',
    });
  });

  it('paginates with a cursor and walks every notification once', async () => {
    const app = await notifApp(rows);
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page: NotificationPage = await app.call('GET', '/notifications', {
        query: { limit: 2, cursor },
      });
      seen.push(...page.items.map((n) => n.id));
      cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor! : undefined;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual(['n-e', 'n-b', 'n-d', 'n-c', 'n-a']);
  });

  it('unreadOnly=true keeps unread ones only (also across pages); other values do not filter', async () => {
    const app = await notifApp(rows);
    const first = await app.call<NotificationPage>('GET', '/notifications', {
      query: { unreadOnly: 'true', limit: 2 },
    });
    expect(first.items.map((n) => n.id)).toEqual(['n-b', 'n-d']);
    expect(first.pageInfo.hasMore).toBe(true);
    const second = await app.call<NotificationPage>('GET', '/notifications', {
      query: { unreadOnly: 'true', limit: 2, cursor: first.pageInfo.nextCursor },
    });
    expect(second.items.map((n) => n.id)).toEqual(['n-c']);
    expect(second.pageInfo).toEqual({ nextCursor: null, hasMore: false });
    const all = await app.call<NotificationPage>('GET', '/notifications', {
      query: { unreadOnly: 'false' },
    });
    expect(all.items).toHaveLength(5);
  });

  it('is empty for an empty inbox', async () => {
    const app = await notifApp([]);
    expect(await app.call('GET', '/notifications')).toEqual({
      items: [],
      pageInfo: { nextCursor: null, hasMore: false },
    });
    expect(await app.call('GET', '/notifications/unread-count')).toEqual({ count: 0 });
  });
});

describe('notification reads', () => {
  const rows = [
    notif('n-1', { createdAt: '2026-06-01T00:00:00.000Z' }),
    notif('n-2', { createdAt: '2026-06-02T00:00:00.000Z' }),
    notif('n-3', { createdAt: '2026-06-03T00:00:00.000Z', readAt: '2026-06-04T00:00:00.000Z' }),
  ];
  const unread = async (app: Awaited<ReturnType<typeof notifApp>>) => ({
    count: (await app.call<{ count: number }>('GET', '/notifications/unread-count')).count,
    me: (await app.call<MeResponse>('GET', '/auth/me')).unreadNotifications,
    unreadOnly: (
      await app.call<NotificationPage>('GET', '/notifications', { query: { unreadOnly: 'true' } })
    ).items.length,
  });

  it('unread-count and /auth/me agree with the stored state', async () => {
    const app = await notifApp(rows);
    expect(await unread(app)).toEqual({ count: 2, me: 2, unreadOnly: 2 });
  });

  it('POST /notifications/{id}/read sets readAt, returns the item and keeps the counts consistent', async () => {
    const app = await notifApp(rows);
    const { events, off } = collectBus();
    const item = await app.call<NotificationItem>('POST', '/notifications/n-1/read');
    off();
    expect(item.id).toBe('n-1');
    expect(item.readAt).not.toBeNull();
    expect(new Date(item.readAt!).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect((await app.db.get<NotificationRecord>('notifications', 'n-1'))!.readAt).toBe(
      item.readAt,
    );
    expect(await unread(app)).toEqual({ count: 1, me: 1, unreadOnly: 1 });
    expect(events).toEqual([{ type: 'notification', notificationId: 'n-1' }]);
  });

  it('reading is idempotent: the first readAt is kept and nothing more is emitted', async () => {
    const app = await notifApp(rows);
    const first = await app.call<NotificationItem>('POST', '/notifications/n-1/read');
    const { events, off } = collectBus();
    const again = await app.call<NotificationItem>('POST', '/notifications/n-1/read');
    const old = await app.call<NotificationItem>('POST', '/notifications/n-3/read');
    off();
    expect(again.readAt).toBe(first.readAt);
    expect(old.readAt).toBe('2026-06-04T00:00:00.000Z');
    expect(events).toEqual([]);
    expect(await unread(app)).toEqual({ count: 1, me: 1, unreadOnly: 1 });
  });

  it('404s for an unknown notification', async () => {
    const app = await notifApp(rows);
    await expect(app.call('POST', '/notifications/n-nope/read')).rejects.toSatisfy(status(404));
  });

  it('POST /notifications/read-all reads everything, is idempotent and updates /auth/me', async () => {
    const app = await notifApp(rows);
    const { events, off } = collectBus();
    expect(await app.call('POST', '/notifications/read-all')).toEqual({ updated: 2 });
    expect(await unread(app)).toEqual({ count: 0, me: 0, unreadOnly: 0 });
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('notification');
    expect(await app.call('POST', '/notifications/read-all')).toEqual({ updated: 0 });
    off();
    expect(events).toHaveLength(1);
    // Items read earlier keep their original timestamp.
    expect((await app.db.get<NotificationRecord>('notifications', 'n-3'))!.readAt).toBe(
      '2026-06-04T00:00:00.000Z',
    );
    const all = await app.call<NotificationPage>('GET', '/notifications');
    expect(all.items.every((n) => n.readAt !== null)).toBe(true);
  });
});

describe('notifying the persona about comments (notifyPersonaOfComment)', () => {
  const setup = async () => {
    const app = await appWith([
      cm({ id: 'c-persona', assetId: 'a-mine', authorId: FX_PERSONA }),
      cm({ id: 'c-other', assetId: 'a-mine', authorId: FX_OTHER }),
    ]);
    const assets = await app.db.list<AssetRecord>('assets');
    const rows = await app.db.list<CommentRecord>('comments');
    return {
      app,
      mine: assets.find((a) => a.id === 'a-mine')!,
      theirs: assets.find((a) => a.id === 'a-fx-001')!,
      persona: rows.find((c) => c.id === 'c-persona')!,
      other: rows.find((c) => c.id === 'c-other')!,
    };
  };
  const kenji = { id: FX_OTHER, displayName: 'Kenji Matsuda' };
  const inbox = (app: Awaited<ReturnType<typeof appWith>>) =>
    app.db.list<NotificationRecord>('notifications');

  it('COMMENT_CREATED / ISSUE_CREATED when someone comments on an asset the persona owns', async () => {
    const { app, mine } = await setup();
    const { events, off } = collectBus();
    const top = cm({ id: 'c-new-1', assetId: 'a-mine', authorId: FX_OTHER });
    const issue = cm({ id: 'c-new-2', assetId: 'a-mine', authorId: FX_OTHER, kind: 'ISSUE' });
    const id1 = await notifyPersonaOfComment(app.ctx, {
      asset: mine,
      comment: top,
      author: kenji,
      parent: null,
    });
    const id2 = await notifyPersonaOfComment(app.ctx, {
      asset: mine,
      comment: issue,
      author: kenji,
      parent: null,
    });
    off();
    const rows = await inbox(app);
    expect(rows.map((n) => n.type).sort()).toEqual(['COMMENT_CREATED', 'ISSUE_CREATED']);
    const first = rows.find((n) => n.id === id1)!;
    expect(first).toMatchObject({ type: 'COMMENT_CREATED', readAt: null });
    // The payload keys are the seed's.
    expect(first.payload).toEqual({
      assetId: 'a-mine',
      assetSlug: 'mine',
      assetTitle: 'My Own Asset',
      commentId: 'c-new-1',
      authorDisplayName: 'Kenji Matsuda',
    });
    expect(rows.find((n) => n.id === id2)!.type).toBe('ISSUE_CREATED');
    expect(events).toEqual([
      { type: 'notification', notificationId: id1 },
      { type: 'notification', notificationId: id2 },
    ]);
    expect((await app.call<MeResponse>('GET', '/auth/me')).unreadNotifications).toBe(2);
  });

  it('COMMENT_REPLY when someone replies to a comment of the persona', async () => {
    const { app, theirs, persona } = await setup();
    const reply = cm({
      id: 'c-reply',
      assetId: 'a-fx-001',
      authorId: FX_OTHER,
      parentId: persona.id,
      depth: 1,
    });
    const id = await notifyPersonaOfComment(app.ctx, {
      asset: theirs,
      comment: reply,
      author: kenji,
      parent: persona,
    });
    const [n] = await inbox(app);
    expect(n).toMatchObject({ id, type: 'COMMENT_REPLY' });
    expect(Object.keys(n!.payload).sort()).toEqual(
      ['assetId', 'assetSlug', 'assetTitle', 'authorDisplayName', 'commentId'].sort(),
    );
  });

  it('creates nothing when the persona is the actor, or the comment is not about the persona', async () => {
    const { app, mine, theirs, other } = await setup();
    const self = cm({ id: 'c-self', assetId: 'a-mine', authorId: FX_PERSONA });
    expect(
      await notifyPersonaOfComment(app.ctx, {
        asset: mine,
        comment: self,
        author: { id: FX_PERSONA, displayName: 'Aria Wijaya' },
        parent: null,
      }),
    ).toBeUndefined();
    // Someone else's top-level comment on an asset of somebody else.
    expect(
      await notifyPersonaOfComment(app.ctx, {
        asset: theirs,
        comment: cm({ id: 'c-x', authorId: 'u-third' }),
        author: { id: 'u-third', displayName: 'Siti' },
        parent: null,
      }),
    ).toBeUndefined();
    // A reply to somebody else's comment, even on the persona's own asset.
    expect(
      await notifyPersonaOfComment(app.ctx, {
        asset: mine,
        comment: cm({ id: 'c-y', authorId: 'u-third', parentId: other.id, depth: 1 }),
        author: { id: 'u-third', displayName: 'Siti' },
        parent: other,
      }),
    ).toBeUndefined();
    expect(await inbox(app)).toEqual([]);
  });

  it('the persona commenting through the API never creates a notification for themselves', async () => {
    const { app } = await setup();
    await app.call('POST', '/assets/a-mine/comments', {
      body: { kind: 'COMMENT', body: doc('note to self') },
    });
    await app.call('POST', '/assets/a-fx-001/comments', {
      body: { kind: 'ISSUE', body: doc('found a bug') },
    });
    expect(await inbox(app)).toEqual([]);
  });
});
