import type {
  CommentAuthor,
  CommentKind,
  CommentListResponse,
  CommentNode,
  IssueStatus,
} from '@/lib/api/types';
import type { AssetRecord, CommentRecord, UserRecord } from '../records';
import { route } from '../router/router';
import { badRequest, forbidden, notFound } from '../router/errors';
import { paginate } from '../router/paginate';
import { resolveVisible } from './assets-read';
import {
  insertComment,
  MAX_DEPTH,
  notifyPersonaOfComment,
  TOMBSTONE_BODY,
  UNKNOWN_AVATAR,
  validateLiteBody,
} from './comment-core';
import { getMe } from './helpers';

const KIND_FILTERS = ['ALL', 'COMMENT', 'ISSUE'] as const;
const KINDS: readonly CommentKind[] = ['COMMENT', 'ISSUE'];
const ISSUE_STATUSES: readonly IssueStatus[] = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'];

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const commentNotFound = (id: string) =>
  notFound(`Comment ${id} not found.`, { code: 'comment.not_found' });

const asBody = (raw: unknown): Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};

function toAuthor(user: UserRecord | undefined, id: string): CommentAuthor {
  return {
    id,
    displayName: user?.displayName ?? '(unknown)',
    avatar: user?.avatar ?? UNKNOWN_AVATAR,
  };
}

/** Builds one node and its replies (oldest first). Rows at `MAX_DEPTH` or deeper are dropped. */
function buildNode(
  row: CommentRecord,
  children: Map<string, CommentRecord[]>,
  users: Map<string, UserRecord>,
): CommentNode {
  const replies = (children.get(row.id) ?? [])
    .filter((c) => c.depth < MAX_DEPTH)
    .map((c) => buildNode(c, children, users));
  return {
    id: row.id,
    kind: row.kind,
    parentId: row.parentId,
    depth: row.depth,
    body: row.body,
    status: row.issueStatus,
    editedAt: row.editedAt,
    createdAt: row.createdAt,
    author: toAuthor(users.get(row.authorId), row.authorId),
    replies,
  };
}

/**
 * Threads of one asset. Pagination is over the top-level rows (newest first, `id` as the
 * tiebreak); each item carries its whole reply subtree. A soft-deleted comment stays in
 * place as its tombstone (its stored body already is the tombstone paragraph) with its replies.
 */
route('GET', '/assets/{assetId}/comments', async (req, ctx): Promise<CommentListResponse> => {
  const kind = req.query.get('kind') || 'ALL';
  if (!(KIND_FILTERS as readonly string[]).includes(kind)) {
    throw badRequest(`Unknown kind "${kind}". Expected ALL, COMMENT or ISSUE.`);
  }
  const { asset } = await resolveVisible(req.params.assetId!, ctx);
  const [rows, userRows] = await Promise.all([
    ctx.db.list<CommentRecord>('comments'),
    ctx.db.list<UserRecord>('users'),
  ]);
  const users = new Map(userRows.map((u) => [u.id, u]));
  const mine = rows.filter((c) => c.assetId === asset.id);

  const children = new Map<string, CommentRecord[]>();
  for (const c of mine) {
    if (c.parentId === null) continue;
    const list = children.get(c.parentId) ?? [];
    list.push(c);
    children.set(c.parentId, list);
  }
  for (const list of children.values()) {
    list.sort((a, b) => cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id));
  }

  const tops = mine
    .filter((c) => c.parentId === null && (kind === 'ALL' || c.kind === kind))
    .sort((a, b) => cmp(b.createdAt, a.createdAt) || cmp(a.id, b.id));
  const page = paginate(tops, req.query, 25);
  return {
    items: page.items.map((t) => buildNode(t, children, users)),
    pageInfo: page.pageInfo,
  };
});

route('POST', '/assets/{assetId}/comments', async (req, ctx) => {
  const input = asBody(req.body);
  if (typeof input.kind !== 'string' || !(KINDS as readonly string[]).includes(input.kind)) {
    throw badRequest('kind must be COMMENT or ISSUE.', {
      fields: [{ path: 'kind', code: 'invalid', message: 'Expected COMMENT or ISSUE.' }],
    });
  }
  const parentId = input.parentId ?? null;
  if (parentId !== null && (typeof parentId !== 'string' || !parentId)) {
    throw badRequest('parentId must be a comment id.', {
      fields: [{ path: 'parentId', code: 'invalid', message: 'Expected a comment id.' }],
    });
  }
  const { asset } = await resolveVisible(req.params.assetId!, ctx);
  const body = validateLiteBody(input.body);

  let parent: CommentRecord | null = null;
  if (parentId !== null) {
    parent = (await ctx.db.get<CommentRecord>('comments', parentId)) ?? null;
    if (!parent || parent.assetId !== asset.id) {
      throw badRequest('Parent comment not found on this asset.', {
        code: 'comment.parent_not_found',
        fields: [{ path: 'parentId', code: 'not_found', message: 'Unknown parent comment.' }],
      });
    }
    if (parent.depth + 1 >= MAX_DEPTH) {
      throw badRequest(`Replies nest at most ${MAX_DEPTH} levels deep.`, {
        code: 'comment.depth_exceeded',
      });
    }
  }

  const comment = await insertComment(ctx, {
    assetId: asset.id,
    authorId: ctx.meId,
    parent,
    kind: input.kind as CommentKind,
    body,
  });
  await notifyPersonaOfComment(ctx, {
    asset,
    comment,
    author: (await getMe(ctx)).user,
    parent,
  });
  return { id: comment.id };
});

route('PATCH', '/comments/{id}', async (req, ctx) => {
  const id = req.params.id!;
  const row = await ctx.db.get<CommentRecord>('comments', id);
  if (!row || row.deletedAt) throw commentNotFound(id);
  if (row.authorId !== ctx.meId) throw forbidden('You can only edit your own comments.');
  const body = validateLiteBody(asBody(req.body).body);
  await ctx.db.patch<CommentRecord>('comments', id, {
    body,
    editedAt: ctx.now().toISOString(),
  });
  return undefined;
});

/** Soft delete by the author or an admin; the row stays (replies keep their place). */
route('DELETE', '/comments/{id}', async (req, ctx) => {
  const id = req.params.id!;
  const row = await ctx.db.get<CommentRecord>('comments', id);
  if (!row) throw commentNotFound(id);
  const me = await getMe(ctx);
  if (!me.isAdmin && row.authorId !== me.id) {
    throw forbidden('Only the author or an admin can delete a comment.');
  }
  if (!row.deletedAt) {
    await ctx.db.patch<CommentRecord>('comments', id, {
      deletedAt: ctx.now().toISOString(),
      body: TOMBSTONE_BODY,
    });
  }
  return undefined;
});

/** The UI offers every status in a select, so any move between the three states is allowed. */
route('PATCH', '/comments/{id}/status', async (req, ctx) => {
  const id = req.params.id!;
  const status = asBody(req.body).status;
  if (typeof status !== 'string' || !(ISSUE_STATUSES as readonly string[]).includes(status)) {
    throw badRequest('status must be OPEN, ACKNOWLEDGED or RESOLVED.', {
      fields: [
        { path: 'status', code: 'invalid', message: 'Expected OPEN, ACKNOWLEDGED or RESOLVED.' },
      ],
    });
  }
  const row = await ctx.db.get<CommentRecord>('comments', id);
  if (!row) throw commentNotFound(id);
  if (row.kind !== 'ISSUE' || row.parentId !== null) {
    throw badRequest('Only top-level issues have a status.', { code: 'comment.not_an_issue' });
  }
  const [me, asset] = await Promise.all([
    getMe(ctx),
    ctx.db.get<AssetRecord>('assets', row.assetId),
  ]);
  if (!me.isAdmin && asset?.ownerId !== me.id) {
    throw forbidden('Only the asset owner or an admin can change issue status.');
  }
  if (row.issueStatus !== status) {
    await ctx.db.patch<CommentRecord>('comments', id, { issueStatus: status as IssueStatus });
  }
  return undefined;
});
