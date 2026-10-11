import {
  createTestApp,
  fixtureAsset,
  fixtureCatalog,
  FX_OTHER,
  FX_PERSONA,
} from '@/preview/test-utils';
import { ApiError } from '@/lib/api/errors';
import type { CollectionName, Doc } from '@/preview/types';
import type { CommentRecord } from '@/preview/records';
import type { CommentNode, TipTapDoc } from '@/lib/api/types';

/** `expect(promise).rejects.toSatisfy(status(404, 'asset.not_found'))`. */
export const status = (s: number, code?: string) => (e: unknown) =>
  ApiError.isApiError(e) && e.status === s && (code === undefined || e.code === code);

export const doc = (text: string): TipTapDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
export const TOMBSTONE = doc('This comment was deleted.');

let seq = 0;
/** A comment on `a-fx-001` by `u-third`; `createdAt` increases with every call unless overridden. */
export function cm(over: Partial<CommentRecord> & { id: string }): CommentRecord {
  seq += 1;
  return {
    assetId: 'a-fx-001',
    parentId: null,
    authorId: 'u-third',
    kind: 'COMMENT',
    issueStatus: null,
    depth: 0,
    body: doc(`text ${over.id}`),
    createdAt: new Date(Date.UTC(2026, 5, 1, 0, 0, seq)).toISOString(),
    editedAt: null,
    deletedAt: null,
    ...over,
  };
}

export const flat = (nodes: CommentNode[]): CommentNode[] =>
  nodes.flatMap((n) => [n, ...flat(n.replies)]);

/**
 * Fixture catalog (3 published assets owned by `u-other`, `a-fx-001` ...) plus a draft of
 * `u-other` (`a-draft`), an asset owned by the persona (`a-mine`) and a deleted one (`a-gone`).
 */
export async function appWith(
  comments: CommentRecord[],
  opts: { meId?: string; timers?: boolean } = {},
  extra: Partial<Record<CollectionName, Doc[]>> = {},
) {
  const base = fixtureCatalog(3);
  return createTestApp(
    {
      ...base,
      ...extra,
      comments,
      assets: [
        ...(base.assets as ReturnType<typeof fixtureAsset>[]),
        fixtureAsset('a-draft', { status: 'DRAFT', ownerId: FX_OTHER }),
        fixtureAsset('a-mine', { ownerId: FX_PERSONA, slug: 'mine', title: 'My Own Asset' }),
        fixtureAsset('a-gone', { status: 'DELETED' }),
      ],
    },
    { timers: false, ...opts },
  );
}
