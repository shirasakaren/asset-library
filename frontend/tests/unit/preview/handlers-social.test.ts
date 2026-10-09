import { describe, it, expect } from 'vitest';
import { FX_OTHER, FX_PERSONA } from '@/preview/test-utils';
import type { CommentRecord } from '@/preview/records';
import type { CommentListResponse, IssueStatus, TipTapDoc } from '@/lib/api/types';
import { appWith, cm, doc, flat, status, TOMBSTONE } from './social-fixtures';

describe('GET /assets/{assetId}/comments', () => {
  it('returns top-level threads newest first, replies oldest first, with authors and avatars', async () => {
    const app = await appWith([
      cm({ id: 'c-1', createdAt: '2026-06-01T00:00:00.000Z' }),
      cm({ id: 'c-2', createdAt: '2026-06-02T00:00:00.000Z', authorId: FX_OTHER }),
      cm({
        id: 'c-1b',
        parentId: 'c-1',
        depth: 1,
        createdAt: '2026-06-03T00:00:00.000Z',
        editedAt: '2026-06-04T00:00:00.000Z',
      }),
      cm({ id: 'c-1a', parentId: 'c-1', depth: 1, createdAt: '2026-06-02T12:00:00.000Z' }),
    ]);
    const r = await app.call<CommentListResponse>('GET', '/assets/a-fx-001/comments');
    expect(r.items.map((n) => n.id)).toEqual(['c-2', 'c-1']);
    expect(r.pageInfo).toEqual({ nextCursor: null, hasMore: false });
    const c1 = r.items[1]!;
    expect(c1.replies.map((n) => n.id)).toEqual(['c-1a', 'c-1b']);
    expect(c1).toMatchObject({
      kind: 'COMMENT',
      parentId: null,
      depth: 0,
      status: null,
      editedAt: null,
      author: {
        id: 'u-third',
        displayName: 'Siti Rahmawati',
        avatar: { initials: 'SR', bgColor: 'brand-red', fgColor: 'ink-white' },
      },
    });
    expect(c1.replies[1]).toMatchObject({
      parentId: 'c-1',
      depth: 1,
      editedAt: '2026-06-04T00:00:00.000Z',
      replies: [],
    });
    // No stored-only fields leak into the payload.
    expect(c1).not.toHaveProperty('issueStatus');
    expect(c1).not.toHaveProperty('deletedAt');
    expect(c1).not.toHaveProperty('assetId');
  });

  it('only returns the comments of the requested asset, by id or slug', async () => {
    const app = await appWith([cm({ id: 'c-1' }), cm({ id: 'c-other', assetId: 'a-fx-002' })]);
    const byId = await app.call<CommentListResponse>('GET', '/assets/a-fx-001/comments');
    expect(byId.items.map((n) => n.id)).toEqual(['c-1']);
    const bySlug = await app.call<CommentListResponse>('GET', '/assets/fx-002/comments');
    expect(bySlug.items.map((n) => n.id)).toEqual(['c-other']);
  });

  it('nests up to 5 levels (depth 0..4) and drops anything deeper', async () => {
    const chain: CommentRecord[] = [];
    for (let d = 0; d <= 5; d += 1) {
      chain.push(cm({ id: `c-d${d}`, depth: d, parentId: d === 0 ? null : `c-d${d - 1}` }));
    }
    const app = await appWith(chain);
    const r = await app.call<CommentListResponse>('GET', '/assets/a-fx-001/comments');
    expect(flat(r.items).map((n) => n.id)).toEqual(['c-d0', 'c-d1', 'c-d2', 'c-d3', 'c-d4']);
  });

  it('keeps a soft-deleted comment as a tombstone and keeps its children', async () => {
    const app = await appWith([
      cm({ id: 'c-del', body: TOMBSTONE, deletedAt: '2026-06-09T00:00:00.000Z' }),
      cm({ id: 'c-kid', parentId: 'c-del', depth: 1, authorId: FX_OTHER }),
    ]);
    const r = await app.call<CommentListResponse>('GET', '/assets/a-fx-001/comments');
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.body).toEqual(TOMBSTONE);
    expect(r.items[0]!.replies.map((n) => n.id)).toEqual(['c-kid']);
  });

  it('filters top-level rows by kind (ALL / COMMENT / ISSUE)', async () => {
    const app = await appWith([
      cm({ id: 'c-c' }),
      cm({ id: 'c-i', kind: 'ISSUE', issueStatus: 'OPEN' }),
      cm({ id: 'c-r', parentId: 'c-i', depth: 1 }),
    ]);
    const ids = async (kind?: string) =>
      (
        await app.call<CommentListResponse>('GET', '/assets/a-fx-001/comments', {
          query: { kind },
        })
      ).items.map((n) => n.id);
    expect(await ids()).toEqual(['c-i', 'c-c']);
    expect(await ids('ALL')).toEqual(['c-i', 'c-c']);
    expect(await ids('COMMENT')).toEqual(['c-c']);
    expect(await ids('ISSUE')).toEqual(['c-i']);
    const issue = (
      await app.call<CommentListResponse>('GET', '/assets/a-fx-001/comments', {
        query: { kind: 'ISSUE' },
      })
    ).items[0]!;
    expect(issue).toMatchObject({ kind: 'ISSUE', status: 'OPEN' });
    expect(issue.replies.map((n) => n.id)).toEqual(['c-r']);
    await expect(
      app.call('GET', '/assets/a-fx-001/comments', { query: { kind: 'NOPE' } }),
    ).rejects.toSatisfy(status(400));
  });

  it('paginates top-level threads with a cursor (walk visits every thread once)', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => cm({ id: `c-p${i}` }));
    const app = await appWith(rows);
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page: CommentListResponse = await app.call('GET', '/assets/a-fx-001/comments', {
        query: { limit: 3, cursor },
      });
      seen.push(...page.items.map((n) => n.id));
      cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor! : undefined;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual(['c-p6', 'c-p5', 'c-p4', 'c-p3', 'c-p2', 'c-p1', 'c-p0']);
  });

  it('404s for unknown, deleted and (for non-admins) other people drafts', async () => {
    const app = await appWith([]);
    await expect(app.call('GET', '/assets/nope/comments')).rejects.toSatisfy(
      status(404, 'asset.not_found'),
    );
    await expect(app.call('GET', '/assets/a-gone/comments')).rejects.toSatisfy(status(404));
    // The persona is an admin and sees drafts; a plain user does not.
    expect((await app.call<CommentListResponse>('GET', '/assets/a-draft/comments')).items).toEqual(
      [],
    );
    const plain = await appWith([], { meId: 'u-third' });
    await expect(plain.call('GET', '/assets/a-draft/comments')).rejects.toSatisfy(status(404));
  });

  it('returns an empty list for an asset without comments', async () => {
    const app = await appWith([]);
    expect(await app.call('GET', '/assets/a-fx-001/comments')).toEqual({
      items: [],
      pageInfo: { nextCursor: null, hasMore: false },
    });
  });
});

describe('POST /assets/{assetId}/comments', () => {
  const post = (app: Awaited<ReturnType<typeof appWith>>, body: unknown, assetId = 'a-fx-001') =>
    app.call<{ id: string }>('POST', `/assets/${assetId}/comments`, { body });

  it('creates a top-level comment authored by the persona and lists it first', async () => {
    const app = await appWith([cm({ id: 'c-old', createdAt: '2026-01-01T00:00:00.000Z' })]);
    const { id } = await post(app, { kind: 'COMMENT', body: doc('Great pack!') });
    expect(id).toBeTruthy();
    const r = await app.call<CommentListResponse>('GET', '/assets/a-fx-001/comments');
    expect(r.items.map((n) => n.id)).toEqual([id, 'c-old']);
    expect(r.items[0]).toMatchObject({
      kind: 'COMMENT',
      parentId: null,
      depth: 0,
      status: null,
      editedAt: null,
      body: doc('Great pack!'),
      author: { id: FX_PERSONA, displayName: 'Aria Wijaya' },
    });
    const stored = (await app.db.list<CommentRecord>('comments')).find((c) => c.id === id)!;
    expect(stored).toMatchObject({ assetId: 'a-fx-001', authorId: FX_PERSONA, deletedAt: null });
    expect(new Date(stored.createdAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('creates an ISSUE with status OPEN', async () => {
    const app = await appWith([]);
    const { id } = await post(app, { kind: 'ISSUE', body: doc('Broken prefab') });
    const r = await app.call<CommentListResponse>('GET', '/assets/a-fx-001/comments', {
      query: { kind: 'ISSUE' },
    });
    expect(r.items[0]).toMatchObject({ id, kind: 'ISSUE', status: 'OPEN' });
  });

  it('creates a reply one level deeper and forces its kind to COMMENT', async () => {
    const app = await appWith([cm({ id: 'c-top', kind: 'ISSUE', issueStatus: 'OPEN' })]);
    const { id } = await post(app, { kind: 'ISSUE', parentId: 'c-top', body: doc('Looking') });
    const r = await app.call<CommentListResponse>('GET', '/assets/a-fx-001/comments');
    expect(r.items[0]!.replies).toHaveLength(1);
    expect(r.items[0]!.replies[0]).toMatchObject({
      id,
      parentId: 'c-top',
      depth: 1,
      kind: 'COMMENT',
      status: null,
    });
  });

  it('accepts a reply at depth 4 parent-1 and rejects a reply to a depth-4 comment (400 comment.depth_exceeded)', async () => {
    const chain: CommentRecord[] = [];
    for (let d = 0; d <= 4; d += 1) {
      chain.push(cm({ id: `c-d${d}`, depth: d, parentId: d === 0 ? null : `c-d${d - 1}` }));
    }
    const app = await appWith(chain);
    const ok = await post(app, { kind: 'COMMENT', parentId: 'c-d3', body: doc('at the limit') });
    const stored = (await app.db.list<CommentRecord>('comments')).find((c) => c.id === ok.id)!;
    expect(stored.depth).toBe(4);
    await expect(
      post(app, { kind: 'COMMENT', parentId: 'c-d4', body: doc('too deep') }),
    ).rejects.toSatisfy(status(400, 'comment.depth_exceeded'));
  });

  it('rejects an unknown parent and a parent that belongs to another asset (400)', async () => {
    const app = await appWith([cm({ id: 'c-elsewhere', assetId: 'a-fx-002' })]);
    await expect(
      post(app, { kind: 'COMMENT', parentId: 'c-missing', body: doc('x') }),
    ).rejects.toSatisfy(status(400));
    await expect(
      post(app, { kind: 'COMMENT', parentId: 'c-elsewhere', body: doc('x') }),
    ).rejects.toSatisfy(status(400));
    expect(await app.db.list('comments')).toHaveLength(1);
  });

  it('rejects empty content, disallowed nodes or marks, oversized bodies and bad kinds (400)', async () => {
    const app = await appWith([]);
    const bad = (b: unknown) => expect(post(app, b)).rejects.toSatisfy(status(400));
    await bad({ kind: 'COMMENT', body: { type: 'doc', content: [] } });
    await bad({ kind: 'COMMENT', body: { type: 'doc' } });
    await bad({ kind: 'COMMENT', body: doc('   ') });
    await bad({ kind: 'COMMENT', body: { type: 'doc', content: [{ type: 'paragraph' }] } });
    await bad({ kind: 'COMMENT' });
    await bad({ kind: 'COMMENT', body: 'plain text' });
    await bad({ kind: 'COMMENT', body: { type: 'paragraph', content: [] } });
    await bad({ kind: 'NOPE', body: doc('x') });
    await bad({ body: doc('x') });
    await bad(null);
    await bad({
      kind: 'COMMENT',
      body: { type: 'doc', content: [{ type: 'heading', content: [{ type: 'text', text: 'x' }] }] },
    });
    await bad({
      kind: 'COMMENT',
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'x', marks: [{ type: 'strike' }] }],
          },
        ],
      },
    });
    await bad({ kind: 'COMMENT', body: doc('x'.repeat(30_000)) });
    await bad({ kind: 'COMMENT', parentId: 5, body: doc('x') });
    expect(await app.db.list('comments')).toHaveLength(0);
  });

  it('accepts rich lite content (marks, lists, code, image only)', async () => {
    const app = await appWith([]);
    const body: TipTapDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            {
              type: 'text',
              text: ' link',
              marks: [{ type: 'link', attrs: { href: 'https://x.test' } }],
            },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }],
            },
          ],
        },
        { type: 'codeBlock', content: [{ type: 'text', text: 'let a = 1;' }] },
      ],
    };
    await post(app, { kind: 'COMMENT', body });
    await post(app, {
      kind: 'COMMENT',
      body: { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://x.test/a.png' } }] },
    });
    expect(await app.db.list('comments')).toHaveLength(2);
  });

  it('404s for unknown, deleted and (non-admin) invisible assets', async () => {
    const app = await appWith([]);
    await expect(post(app, { kind: 'COMMENT', body: doc('x') }, 'nope')).rejects.toSatisfy(
      status(404, 'asset.not_found'),
    );
    await expect(post(app, { kind: 'COMMENT', body: doc('x') }, 'a-gone')).rejects.toSatisfy(
      status(404),
    );
    const plain = await appWith([], { meId: 'u-third' });
    await expect(post(plain, { kind: 'COMMENT', body: doc('x') }, 'a-draft')).rejects.toSatisfy(
      status(404),
    );
  });
});

describe('PATCH /comments/{id}', () => {
  const patch = (app: Awaited<ReturnType<typeof appWith>>, id: string, body: unknown) =>
    app.call('PATCH', `/comments/${id}`, { body });

  it('lets the author edit; sets editedAt, keeps createdAt and the position', async () => {
    const app = await appWith([cm({ id: 'c-mine', authorId: FX_PERSONA })]);
    const before = (await app.db.get<CommentRecord>('comments', 'c-mine'))!;
    expect(await patch(app, 'c-mine', { body: doc('edited') })).toBeUndefined();
    const after = (await app.db.get<CommentRecord>('comments', 'c-mine'))!;
    expect(after.body).toEqual(doc('edited'));
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.editedAt).not.toBeNull();
    expect(new Date(after.editedAt!).getTime()).toBeGreaterThan(Date.now() - 60_000);
    const r = await app.call<CommentListResponse>('GET', '/assets/a-fx-001/comments');
    expect(r.items[0]).toMatchObject({ id: 'c-mine', editedAt: after.editedAt });
  });

  it('403 for non-authors, even admins; 404 unknown or deleted; 400 invalid body', async () => {
    const app = await appWith([
      cm({ id: 'c-theirs', authorId: FX_OTHER }),
      cm({
        id: 'c-del',
        authorId: FX_PERSONA,
        body: TOMBSTONE,
        deletedAt: '2026-06-09T00:00:00.000Z',
      }),
      cm({ id: 'c-mine', authorId: FX_PERSONA }),
    ]);
    await expect(patch(app, 'c-theirs', { body: doc('hijack') })).rejects.toSatisfy(status(403));
    await expect(patch(app, 'c-nope', { body: doc('x') })).rejects.toSatisfy(status(404));
    await expect(patch(app, 'c-del', { body: doc('x') })).rejects.toSatisfy(status(404));
    await expect(patch(app, 'c-mine', { body: { type: 'doc', content: [] } })).rejects.toSatisfy(
      status(400),
    );
    await expect(patch(app, 'c-mine', {})).rejects.toSatisfy(status(400));
    expect((await app.db.get<CommentRecord>('comments', 'c-theirs'))!.body).toEqual(
      doc('text c-theirs'),
    );
    expect((await app.db.get<CommentRecord>('comments', 'c-mine'))!.editedAt).toBeNull();
  });
});

describe('DELETE /comments/{id}', () => {
  const del = (app: Awaited<ReturnType<typeof appWith>>, id: string) =>
    app.call('DELETE', `/comments/${id}`);

  it('soft-deletes the persona own comment into a tombstone and keeps its replies', async () => {
    const app = await appWith([
      cm({ id: 'c-mine', authorId: FX_PERSONA }),
      cm({ id: 'c-kid', parentId: 'c-mine', depth: 1 }),
    ]);
    expect(await del(app, 'c-mine')).toBeUndefined();
    const stored = (await app.db.get<CommentRecord>('comments', 'c-mine'))!;
    expect(stored.deletedAt).not.toBeNull();
    expect(stored.body).toEqual(TOMBSTONE);
    const r = await app.call<CommentListResponse>('GET', '/assets/a-fx-001/comments');
    expect(r.items[0]!.body).toEqual(TOMBSTONE);
    expect(r.items[0]!.replies.map((n) => n.id)).toEqual(['c-kid']);
  });

  it('lets an admin delete other peoples comments', async () => {
    const app = await appWith([cm({ id: 'c-theirs', authorId: FX_OTHER })]);
    await del(app, 'c-theirs');
    expect((await app.db.get<CommentRecord>('comments', 'c-theirs'))!.deletedAt).not.toBeNull();
  });

  it('403 for a non-admin deleting someone else, but the author may delete their own', async () => {
    const app = await appWith(
      [cm({ id: 'c-theirs', authorId: FX_OTHER }), cm({ id: 'c-mine', authorId: 'u-third' })],
      { meId: 'u-third' },
    );
    await expect(del(app, 'c-theirs')).rejects.toSatisfy(status(403));
    expect((await app.db.get<CommentRecord>('comments', 'c-theirs'))!.deletedAt).toBeNull();
    await del(app, 'c-mine');
    expect((await app.db.get<CommentRecord>('comments', 'c-mine'))!.deletedAt).not.toBeNull();
  });

  it('is idempotent (second delete keeps the first deletedAt) and 404s for unknown ids', async () => {
    const app = await appWith([cm({ id: 'c-mine', authorId: FX_PERSONA })]);
    await del(app, 'c-mine');
    const first = (await app.db.get<CommentRecord>('comments', 'c-mine'))!.deletedAt;
    expect(await del(app, 'c-mine')).toBeUndefined();
    expect((await app.db.get<CommentRecord>('comments', 'c-mine'))!.deletedAt).toBe(first);
    await expect(del(app, 'c-nope')).rejects.toSatisfy(status(404));
  });
});

describe('PATCH /comments/{id}/status', () => {
  const set = (app: Awaited<ReturnType<typeof appWith>>, id: string, st: unknown) =>
    app.call('PATCH', `/comments/${id}/status`, { body: { status: st } });
  const issue = (id: string, over: Partial<CommentRecord> = {}) =>
    cm({ id, kind: 'ISSUE', issueStatus: 'OPEN', ...over });
  const statusOf = async (app: Awaited<ReturnType<typeof appWith>>, id: string) =>
    (await app.db.get<CommentRecord>('comments', id))!.issueStatus as IssueStatus | null;

  it('walks OPEN -> ACKNOWLEDGED -> RESOLVED and back (every move the UI offers)', async () => {
    const app = await appWith([issue('c-i')]);
    for (const next of ['ACKNOWLEDGED', 'RESOLVED', 'OPEN', 'RESOLVED', 'ACKNOWLEDGED'] as const) {
      expect(await set(app, 'c-i', next)).toBeUndefined();
      expect(await statusOf(app, 'c-i')).toBe(next);
    }
    const r = await app.call<CommentListResponse>('GET', '/assets/a-fx-001/comments');
    expect(r.items[0]!.status).toBe('ACKNOWLEDGED');
  });

  it('setting the current status again is a no-op success', async () => {
    const app = await appWith([issue('c-i', { issueStatus: 'RESOLVED' })]);
    await set(app, 'c-i', 'RESOLVED');
    expect(await statusOf(app, 'c-i')).toBe('RESOLVED');
  });

  it('lets the asset owner change status, a plain third party is forbidden, admin may', async () => {
    const rows = [issue('c-i', { authorId: 'u-third' })];
    // Persona owns a-mine and is also admin; test owner-without-admin with FX_OTHER (owns a-fx-001).
    const owner = await appWith(rows, { meId: FX_OTHER });
    await set(owner, 'c-i', 'ACKNOWLEDGED');
    expect(await statusOf(owner, 'c-i')).toBe('ACKNOWLEDGED');

    const third = await appWith(rows, { meId: 'u-third' });
    await expect(set(third, 'c-i', 'RESOLVED')).rejects.toSatisfy(status(403));
    expect(await statusOf(third, 'c-i')).toBe('OPEN');

    const admin = await appWith(rows);
    await set(admin, 'c-i', 'RESOLVED');
    expect(await statusOf(admin, 'c-i')).toBe('RESOLVED');
  });

  it('400 for non-issues, replies and invalid statuses; 404 unknown', async () => {
    const app = await appWith([
      cm({ id: 'c-plain' }),
      issue('c-i'),
      cm({ id: 'c-reply', parentId: 'c-i', depth: 1 }),
    ]);
    await expect(set(app, 'c-plain', 'RESOLVED')).rejects.toSatisfy(status(400));
    await expect(set(app, 'c-reply', 'RESOLVED')).rejects.toSatisfy(status(400));
    await expect(set(app, 'c-i', 'DONE')).rejects.toSatisfy(status(400));
    await expect(set(app, 'c-i', undefined)).rejects.toSatisfy(status(400));
    await expect(set(app, 'c-nope', 'RESOLVED')).rejects.toSatisfy(status(404));
    expect(await statusOf(app, 'c-i')).toBe('OPEN');
  });
});
