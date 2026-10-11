import type { CommentKind, NotificationType, ServerAvatar, TipTapDoc } from '@/lib/api/types';
import { LITE_ALLOWED_MARKS, LITE_ALLOWED_NODES } from '@/components/rich-text/lite-nodes';
import type { AssetRecord, CommentRecord, UserRecord } from '../records';
import type { PreviewContext } from '../router/router';
import { badRequest } from '../router/errors';
import { createNotification } from './notifications';

/** A reply may nest at most this many levels (stored `depth` 0..MAX_DEPTH-1). */
export const MAX_DEPTH = 5;

/** What a soft-deleted comment shows (same paragraph the seed stores). */
export const TOMBSTONE_BODY: TipTapDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'This comment was deleted.' }] }],
};

export const UNKNOWN_AVATAR: ServerAvatar = {
  initials: '?',
  bgColor: 'brand-blue',
  fgColor: 'ink-white',
};

// Same cap as the real API's lite allowlist (comments + release notes).
const MAX_BODY_BYTES = 24 * 1024;

interface RawNode {
  type?: unknown;
  text?: unknown;
  content?: unknown;
  marks?: unknown;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Plain text of a TipTap document (blocks joined by a space). */
export function plainText(doc: unknown): string {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (!isObject(n)) return;
    if (typeof n.text === 'string') out.push(n.text);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(doc);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Light structural check of a comment body, consistent with `lite-nodes.ts`: a `doc` whose
 * nodes and marks are all in the Lite allowlist, at most 24 KiB, with some visible text or an
 * image. The UI strips disallowed nodes before submitting, so anything else is a 400.
 */
export function validateLiteBody(raw: unknown): TipTapDoc {
  const fail = (message: string, code = 'invalid') =>
    badRequest(message, { fields: [{ path: 'body', code, message }] });
  if (!isObject(raw) || raw.type !== 'doc') throw fail('body must be a TipTap document.');
  if (raw.content !== undefined && !Array.isArray(raw.content)) {
    throw fail('body.content must be an array.');
  }
  let hasMedia = false;
  const visit = (node: unknown): void => {
    if (!isObject(node)) throw fail('body contains an invalid node.');
    const n = node as RawNode;
    if (typeof n.type !== 'string' || !LITE_ALLOWED_NODES.has(n.type)) {
      throw fail(`Node type "${String(n.type)}" is not allowed.`, 'node.disallowed');
    }
    if (n.type === 'image') hasMedia = true;
    if (n.text !== undefined && typeof n.text !== 'string') throw fail('text must be a string.');
    if (n.marks !== undefined) {
      if (!Array.isArray(n.marks)) throw fail('marks must be an array.');
      for (const m of n.marks) {
        const t = isObject(m) ? m.type : undefined;
        if (typeof t !== 'string' || !LITE_ALLOWED_MARKS.has(t)) {
          throw fail(`Mark type "${String(t)}" is not allowed.`, 'mark.disallowed');
        }
      }
    }
    if (n.content !== undefined) {
      if (!Array.isArray(n.content)) throw fail('content must be an array.');
      n.content.forEach(visit);
    }
  };
  (raw.content as unknown[] | undefined)?.forEach(visit);
  if (new TextEncoder().encode(JSON.stringify(raw)).length > MAX_BODY_BYTES) {
    throw fail('Comment is too long.', 'too_long');
  }
  if (!hasMedia && plainText(raw).length === 0) throw fail('Comment cannot be empty.', 'empty');
  return raw as unknown as TipTapDoc;
}

export interface NewComment {
  assetId: string;
  authorId: string;
  parent: CommentRecord | null;
  kind: CommentKind;
  body: TipTapDoc;
  /** Id prefix; simulated replies use their own so they can be recognised later. */
  idPrefix?: string;
}

/** Builds and stores a comment: depth from the parent, replies are always `COMMENT`, issues start OPEN. */
export async function insertComment(ctx: PreviewContext, c: NewComment): Promise<CommentRecord> {
  const kind: CommentKind = c.parent ? 'COMMENT' : c.kind;
  return ctx.db.put<CommentRecord>('comments', {
    id: ctx.newId(c.idPrefix ?? 'c'),
    assetId: c.assetId,
    parentId: c.parent?.id ?? null,
    authorId: c.authorId,
    kind,
    issueStatus: kind === 'ISSUE' ? 'OPEN' : null,
    depth: c.parent ? c.parent.depth + 1 : 0,
    body: c.body,
    createdAt: ctx.now().toISOString(),
    editedAt: null,
    deletedAt: null,
  });
}

/**
 * Inbox side of a new comment, like the real API's fan-out: the persona is told when someone
 * else replies to their comment (`COMMENT_REPLY`) or opens a comment / issue on an asset they
 * own (`COMMENT_CREATED` / `ISSUE_CREATED`). Nothing is created when the persona is the actor.
 * Payload keys are the seed's: `assetId`, `assetSlug`, `assetTitle`, `commentId`,
 * `authorDisplayName`. Returns the notification id, if one was created.
 */
export async function notifyPersonaOfComment(
  ctx: PreviewContext,
  args: {
    asset: Pick<AssetRecord, 'id' | 'slug' | 'title' | 'ownerId'>;
    comment: CommentRecord;
    author: Pick<UserRecord, 'id' | 'displayName'> | undefined;
    parent: CommentRecord | null;
  },
): Promise<string | undefined> {
  const { asset, comment, parent } = args;
  if (comment.authorId === ctx.meId) return undefined;
  let type: NotificationType | undefined;
  if (parent) {
    if (parent.authorId === ctx.meId) type = 'COMMENT_REPLY';
  } else if (asset.ownerId === ctx.meId) {
    type = comment.kind === 'ISSUE' ? 'ISSUE_CREATED' : 'COMMENT_CREATED';
  }
  if (!type) return undefined;
  const n = await createNotification(ctx, type, {
    assetId: asset.id,
    assetSlug: asset.slug,
    assetTitle: asset.title,
    commentId: comment.id,
    authorDisplayName: args.author?.displayName ?? '',
  });
  return n.id;
}
