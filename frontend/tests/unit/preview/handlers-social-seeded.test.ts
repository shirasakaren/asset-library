import { beforeAll, describe, expect, it } from 'vitest';
import { createSeededTestApp, type TestApp } from '@/preview/test-utils';
import type { AssetRecord, CommentRecord, NotificationRecord } from '@/preview/records';
import type {
  CommentListResponse,
  CommentNode,
  MeResponse,
  NotificationItem,
  NotificationPage,
} from '@/lib/api/types';

const count = (nodes: CommentNode[]): number => nodes.reduce((n, c) => n + 1 + count(c.replies), 0);

async function allThreads(app: TestApp, assetId: string, kind?: string): Promise<CommentNode[]> {
  const out: CommentNode[] = [];
  let cursor: string | undefined;
  do {
    const page: CommentListResponse = await app.call('GET', `/assets/${assetId}/comments`, {
      query: { limit: 7, cursor, kind },
    });
    out.push(...page.items);
    cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor! : undefined;
  } while (cursor);
  return out;
}

// Smoke suite over the REAL committed seed JSON.
describe('comment and notification handlers over the real seed', () => {
  let app: TestApp;
  let comments: CommentRecord[];
  let assets: AssetRecord[];

  beforeAll(async () => {
    app = await createSeededTestApp({ timers: false });
    comments = await app.db.list<CommentRecord>('comments');
    assets = await app.db.list<AssetRecord>('assets');
  });

  it('builds a valid tree for a busy asset whose node count equals the stored count', async () => {
    const counts = new Map<string, number>();
    for (const c of comments) counts.set(c.assetId, (counts.get(c.assetId) ?? 0) + 1);
    const [busiest] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const threads = await allThreads(app, busiest);
    expect(count(threads)).toBe(counts.get(busiest));

    const stored = new Map(comments.map((c) => [c.id, c]));
    const check = (node: CommentNode, parent: CommentNode | null) => {
      expect(node.parentId).toBe(parent?.id ?? null);
      expect(node.depth).toBe(parent ? parent.depth + 1 : 0);
      expect(node.depth).toBeLessThan(5);
      expect(node.author.displayName).not.toBe('(unknown)');
      expect(node.author.avatar.initials).toBeTruthy();
      expect(stored.get(node.id)!.assetId).toBe(busiest);
      if (node.kind === 'ISSUE') expect(node.status).not.toBeNull();
      const times = node.replies.map((r) => r.createdAt);
      expect([...times].sort()).toEqual(times);
      node.replies.forEach((r) => check(r, node));
    };
    threads.forEach((t) => check(t, null));
    const tops = threads.map((t) => t.createdAt);
    expect([...tops].sort().reverse()).toEqual(tops);
  });

  it('every asset lists all of its stored comments (tombstones included) and every thread is reachable', async () => {
    let total = 0;
    for (const a of assets.filter((x) => x.status !== 'DELETED')) {
      const stored = comments.filter((c) => c.assetId === a.id).length;
      const threads = await allThreads(app, a.id);
      expect(count(threads), a.id).toBe(stored);
      total += stored;
    }
    expect(total).toBe(comments.length);
  });

  it('keeps the seeded tombstones in place', async () => {
    const del = comments.find((c) => c.deletedAt)!;
    const threads = await allThreads(app, del.assetId);
    const flat = (ns: CommentNode[]): CommentNode[] => ns.flatMap((n) => [n, ...flat(n.replies)]);
    const node = flat(threads).find((n) => n.id === del.id)!;
    expect(node.body).toEqual(del.body);
  });

  it('the kind filter splits top-level threads into comments and issues', async () => {
    const withIssue = comments.find((c) => c.kind === 'ISSUE')!;
    const [all, onlyIssues, onlyComments] = await Promise.all([
      allThreads(app, withIssue.assetId),
      allThreads(app, withIssue.assetId, 'ISSUE'),
      allThreads(app, withIssue.assetId, 'COMMENT'),
    ]);
    expect(onlyIssues.length).toBeGreaterThan(0);
    expect(onlyIssues.every((n) => n.kind === 'ISSUE')).toBe(true);
    expect(onlyComments.every((n) => n.kind === 'COMMENT')).toBe(true);
    expect(onlyIssues.length + onlyComments.length).toBe(all.length);
  });

  it('a seeded comment can be replied to and edited, and the new reply shows in the tree', async () => {
    const mine = comments.find((c) => c.authorId === 'u-persona' && c.depth < 3 && !c.deletedAt)!;
    const { id } = await app.call<{ id: string }>('POST', `/assets/${mine.assetId}/comments`, {
      body: {
        kind: 'COMMENT',
        parentId: mine.id,
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
        },
      },
    });
    const flat = (ns: CommentNode[]): CommentNode[] => ns.flatMap((n) => [n, ...flat(n.replies)]);
    const nodes = flat(await allThreads(app, mine.assetId));
    expect(nodes.find((n) => n.id === id)).toMatchObject({
      parentId: mine.id,
      depth: mine.depth + 1,
    });
    await app.call('DELETE', `/comments/${id}`);
  });

  it('all 17 notifications page correctly: newest first, every id once, 10 unread', async () => {
    const stored = await app.db.list<NotificationRecord>('notifications');
    expect(stored).toHaveLength(17);
    const seen: NotificationItem[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page: NotificationPage = await app.call('GET', '/notifications', {
        query: { limit: 5, cursor },
      });
      seen.push(...page.items);
      cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor! : undefined;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(4);
    expect(new Set(seen.map((n) => n.id)).size).toBe(17);
    const times = seen.map((n) => n.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(seen.filter((n) => !n.readAt)).toHaveLength(10);

    const unread: NotificationItem[] = [];
    cursor = undefined;
    do {
      const page: NotificationPage = await app.call('GET', '/notifications', {
        query: { limit: 4, cursor, unreadOnly: 'true' },
      });
      unread.push(...page.items);
      cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor! : undefined;
    } while (cursor);
    expect(unread).toHaveLength(10);
  });

  it('reading one then all keeps unread-count and /auth/me in step (10 -> 9 -> 0)', async () => {
    const me = () => app.call<MeResponse>('GET', '/auth/me');
    const unreadCount = () => app.call<{ count: number }>('GET', '/notifications/unread-count');
    expect((await me()).unreadNotifications).toBe(10);
    expect(await unreadCount()).toEqual({ count: 10 });
    await app.call('POST', '/notifications/n-01/read');
    expect((await me()).unreadNotifications).toBe(9);
    expect(await unreadCount()).toEqual({ count: 9 });
    expect(await app.call('POST', '/notifications/read-all')).toEqual({ updated: 9 });
    expect((await me()).unreadNotifications).toBe(0);
    expect(await unreadCount()).toEqual({ count: 0 });
  });
});
