import type { CommentKind, Engine, TipTapDoc } from '@/lib/api/types';
import type { AssetRecord, CommentRecord, UserRecord } from '../records';
import type { Db } from '../types';
import type { PreviewContext } from '../router/router';
import { insertComment, MAX_DEPTH, notifyPersonaOfComment, plainText } from './comment-core';

/**
 * Simulated social life: a little while after the persona comments on an asset that somebody
 * else owns, the owner answers. The answer is a real `CommentRecord` plus a `COMMENT_REPLY`
 * notification in the persona's inbox and a bus event, so the bell and the thread update live.
 *
 * Everything here only touches the `Db` and the event bus (never React state), so the reply
 * arrives the same way whichever page the visitor is on.
 */

export const SIMULATED_REPLY_DELAY_MS = 6000;

/** Id prefix of simulated replies; lets the "once per issue" rule recognise them in the Db. */
const SIM_PREFIX = 'c-sim';

/** Parent ids that already have a reply scheduled or delivered in this page session (per database). */
const handledByDb = new WeakMap<Db, Set<string>>();

function handledFor(db: Db): Set<string> {
  let set = handledByDb.get(db);
  if (!set) handledByDb.set(db, (set = new Set()));
  return set;
}

export type ReplyCategory = 'question' | 'praise' | 'bug' | 'other';

/** Templates per category; `{name}` is the persona's first name, `{title}` and `{engine}` the asset's. */
export const REPLY_POOLS: Record<ReplyCategory, string[]> = {
  question: [
    'Good question, {name}! {title} works in {engine} out of the box. Import it into a fresh project and you should be set.',
    'Thanks for asking, {name}. Yes, that is supported in {engine}. I will add a note about it to the description.',
    'Hi {name}, short answer: yes. {title} is tested with {engine}, and the latest version covers this.',
  ],
  praise: [
    'Thank you so much, {name}! Really glad {title} is useful for you.',
    'That means a lot, {name}. Let me know how it goes in {engine}!',
    'Thanks {name}! If you build something with {title}, I would love to see it.',
  ],
  bug: [
    'Thanks for reporting this, {name}. I have acknowledged it and will look into it for the next update of {title}.',
    'Sorry about that, {name}. Could you tell me your {engine} version? As a workaround, re-importing the package into a clean project usually helps.',
    'Good catch, {name}. I can reproduce something similar and will fix it in the next release. For now, try a clean import in {engine}.',
  ],
  other: [
    'Thanks for the comment, {name}!',
    'Appreciate the feedback, {name}. {title} will keep getting updates.',
    'Thanks for stopping by, {name}. Let me know if anything else comes up with {title}.',
  ],
};

const ENGINE_LABELS: Partial<Record<Engine, string>> = {
  UNITY: 'Unity',
  UNREAL: 'Unreal Engine',
  BLENDER: 'Blender',
  STANDALONE_3D: 'any 3D tool',
  AUDIO: 'any audio workflow',
  IMAGE: 'any image editor',
  VIDEO: 'any video editor',
};

const QUESTION_START =
  /^(how|what|why|when|where|which|who|can|could|does|do|is|are|will|would|should)\b/i;
const BUG_WORDS =
  /\b(bugs?|errors?|crash(?:es|ed|ing)?|broken|not working|doesn'?t work|does not work|fail(?:s|ed|ing)?|glitch(?:es|y)?|missing|issues?|problems?|freez(?:e|es|ing)|stuck)\b/i;
const PRAISE_WORDS =
  /\b(love|loved|great|awesome|amazing|nice|excellent|fantastic|perfect|beautiful|brilliant|cool|thanks|thank you|well done|good job)\b/i;

/** Rough intent of a comment: issues are bug reports; then question, bug words, praise, else other. */
export function classifyComment(body: TipTapDoc, kind: CommentKind): ReplyCategory {
  if (kind === 'ISSUE') return 'bug';
  const text = plainText(body);
  if (text.includes('?') || QUESTION_START.test(text)) return 'question';
  if (BUG_WORDS.test(text)) return 'bug';
  if (PRAISE_WORDS.test(text)) return 'praise';
  return 'other';
}

export function fillTemplate(
  template: string,
  vars: { name: string; title: string; engine: string },
): string {
  return template
    .replaceAll('{name}', vars.name)
    .replaceAll('{title}', vars.title)
    .replaceAll('{engine}', vars.engine);
}

/** Stable string hash (FNV-1a) so the same parent always gets the same template. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const replyDoc = (text: string): TipTapDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

/** Root of a comment's thread (the top-level ancestor), tolerating missing ancestors. */
function rootOf(c: CommentRecord, byId: Map<string, CommentRecord>): CommentRecord {
  let cur = c;
  for (let i = 0; i <= MAX_DEPTH && cur.parentId; i += 1) {
    const up = byId.get(cur.parentId);
    if (!up) break;
    cur = up;
  }
  return cur;
}

/**
 * Delivers the reply for `parentId` if it is still sensible: the parent exists, is not deleted
 * and belongs to the persona, the asset exists and has another owner, the reply fits under the
 * depth cap, and neither the owner nor (for issues) the thread has been answered already.
 */
async function deliverReply(ctx: PreviewContext, parentId: string): Promise<void> {
  const parent = await ctx.db.get<CommentRecord>('comments', parentId);
  if (!parent || parent.deletedAt || parent.authorId !== ctx.meId) return;
  if (parent.depth + 1 >= MAX_DEPTH) return;

  const asset = await ctx.db.get<AssetRecord>('assets', parent.assetId);
  if (!asset || asset.status === 'DELETED' || asset.ownerId === ctx.meId) return;
  const [owner, persona] = await Promise.all([
    ctx.db.get<UserRecord>('users', asset.ownerId),
    ctx.db.get<UserRecord>('users', ctx.meId),
  ]);
  if (!owner) return;

  const siblings = (await ctx.db.list<CommentRecord>('comments')).filter(
    (c) => c.assetId === asset.id,
  );
  if (siblings.some((c) => c.parentId === parent.id && c.authorId === asset.ownerId)) return;
  const byId = new Map(siblings.map((c) => [c.id, c]));
  const root = rootOf(parent, byId);
  if (root.kind === 'ISSUE') {
    const answered = siblings.some(
      (c) => c.id.startsWith(`${SIM_PREFIX}-`) && rootOf(c, byId).id === root.id,
    );
    if (answered) return;
  }

  const category = classifyComment(parent.body, parent.kind);
  const pool = REPLY_POOLS[category];
  const text = fillTemplate(pool[hash(parent.id) % pool.length]!, {
    name: persona?.displayName.split(' ')[0] || 'there',
    title: asset.title,
    engine: ENGINE_LABELS[asset.engine] ?? 'your project',
  });

  const comment = await insertComment(ctx, {
    assetId: asset.id,
    authorId: owner.id,
    parent,
    kind: 'COMMENT',
    body: replyDoc(text),
    idPrefix: SIM_PREFIX,
  });
  await notifyPersonaOfComment(ctx, { asset, comment, author: owner, parent });
}

/**
 * Schedules the owner's answer to one of the persona's comments. Returns whether a timer was
 * set: false when simulation is disabled (`ctx.timers === false`) or this parent was already
 * scheduled. Whether a reply is due at all (owner is someone else, parent still exists ...) is
 * decided when the timer fires, so a reset or a delete in the meantime is harmless.
 */
export function scheduleSimulatedReply(
  ctx: PreviewContext,
  parentCommentId: string,
  opts: { delayMs?: number } = {},
): boolean {
  const handled = handledFor(ctx.db);
  if (ctx.timers === false || handled.has(parentCommentId)) return false;
  handled.add(parentCommentId);
  setTimeout(() => {
    deliverReply(ctx, parentCommentId).catch((err: unknown) => {
      console.error('[preview] simulated reply failed', err);
    });
  }, opts.delayMs ?? SIMULATED_REPLY_DELAY_MS);
  return true;
}
