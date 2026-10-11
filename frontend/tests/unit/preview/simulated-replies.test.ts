import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FX_OTHER, FX_PERSONA } from '@/preview/test-utils';
import { bus, type PreviewEvent } from '@/preview/events/bus';
import {
  classifyComment,
  fillTemplate,
  REPLY_POOLS,
  scheduleSimulatedReply,
  SIMULATED_REPLY_DELAY_MS,
} from '@/preview/handlers/simulated-replies';
import type { CommentRecord, NotificationRecord } from '@/preview/records';
import type { CommentListResponse, CommentNode, MeResponse, TipTapDoc } from '@/lib/api/types';
import { appWith, cm, doc, flat } from './social-fixtures';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Lets the timer callback's database round-trips (microtasks only) finish. */
const settle = async () => {
  for (let i = 0; i < 60; i += 1) await Promise.resolve();
};
const tick = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
  await settle();
};

type App = Awaited<ReturnType<typeof appWith>>;

const post = (
  app: App,
  body: { kind: string; parentId?: string; body: TipTapDoc },
  asset = 'a-fx-001',
) => app.call<{ id: string }>('POST', `/assets/${asset}/comments`, { body });

const stored = (app: App) => app.db.list<CommentRecord>('comments');
const sims = async (app: App) => (await stored(app)).filter((c) => c.id.startsWith('c-sim-'));
const inbox = (app: App) => app.db.list<NotificationRecord>('notifications');

function collectBus() {
  const events: PreviewEvent[] = [];
  const off = bus.on((e) => events.push(e));
  return { events, off };
}

describe('simulated reply from the asset owner', () => {
  it('replies once, 6 seconds after the persona comments on an asset of someone else', async () => {
    const app = await appWith([], { timers: true });
    const { id } = await post(app, { kind: 'COMMENT', body: doc('Looks great, nice work!') });
    expect(SIMULATED_REPLY_DELAY_MS).toBe(6000);

    await tick(5_900);
    expect(await sims(app)).toHaveLength(0);
    await tick(200);

    const replies = await sims(app);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({
      assetId: 'a-fx-001',
      authorId: FX_OTHER,
      parentId: id,
      kind: 'COMMENT',
      issueStatus: null,
      depth: 1,
      editedAt: null,
      deletedAt: null,
    });
    const tree = await app.call<CommentListResponse>('GET', '/assets/a-fx-001/comments');
    expect(tree.items[0]!.id).toBe(id);
    expect(tree.items[0]!.replies).toHaveLength(1);
    expect(tree.items[0]!.replies[0]!.author).toMatchObject({
      id: FX_OTHER,
      displayName: 'Kenji Matsuda',
    });

    // Nothing else fires later.
    await tick(60_000);
    expect(await sims(app)).toHaveLength(1);
  });

  it('notifies the persona with a seed-shaped COMMENT_REPLY and emits the bus event', async () => {
    const app = await appWith([], { timers: true });
    const { events, off } = collectBus();
    const { id } = await post(app, { kind: 'COMMENT', body: doc('Thanks for sharing') });
    await tick(6_000);
    off();
    const [reply] = await sims(app);
    const rows = await inbox(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'COMMENT_REPLY', readAt: null });
    expect(rows[0]!.payload).toEqual({
      assetId: 'a-fx-001',
      assetSlug: 'fx-001',
      assetTitle: 'Fixture Item 001',
      commentId: reply!.id,
      authorDisplayName: 'Kenji Matsuda',
    });
    expect(events).toEqual([{ type: 'notification', notificationId: rows[0]!.id }]);
    expect(new Date(rows[0]!.createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(reply!.createdAt).getTime(),
    );
    expect((await app.call<MeResponse>('GET', '/auth/me')).unreadNotifications).toBe(1);
    expect(id).not.toBe(reply!.id);
  });

  it('writes a parent-aware answer (question, praise, bug report, other)', async () => {
    const app = await appWith([], { timers: true });
    const cases: Array<[string, TipTapDoc, string, 'COMMENT' | 'ISSUE']> = [
      ['question', doc('How do I import this into a new project?'), 'question', 'COMMENT'],
      ['praise', doc('Absolutely love this, awesome pack!'), 'praise', 'COMMENT'],
      ['bug', doc('The prefab is missing its material'), 'bug', 'ISSUE'],
      ['bug from words', doc('It crashes when I press play'), 'bug', 'COMMENT'],
      ['other', doc('Used it on a small jam project'), 'other', 'COMMENT'],
    ];
    for (const [label, body, expected, kind] of cases) {
      expect(classifyComment(body, kind), label).toBe(expected);
      const { id } = await post(app, { kind, body });
      await tick(6_000);
      const reply = (await sims(app)).find((c) => c.parentId === id)!;
      expect(reply, label).toBeTruthy();
      const options = REPLY_POOLS[expected as keyof typeof REPLY_POOLS].map((t) =>
        fillTemplate(t, { name: 'Aria', title: 'Fixture Item 001', engine: 'Unity' }),
      );
      const plain = (reply.body.content![0]!.content![0] as { text: string }).text;
      expect(options, label).toContain(plain);
      expect(plain, label).not.toMatch(/[{}]/);
    }
  });

  it('is deterministic: the same parent id and text always get the same reply', async () => {
    const texts: string[] = [];
    for (let run = 0; run < 2; run += 1) {
      const app = await appWith([cm({ id: 'c-fixed', authorId: FX_PERSONA })], { timers: true });
      scheduleSimulatedReply(app.ctx, 'c-fixed');
      await tick(6_000);
      const [reply] = await sims(app);
      texts.push((reply!.body.content![0]!.content![0] as { text: string }).text);
    }
    expect(texts[0]).toBe(texts[1]);
  });

  it('also answers a reply of the persona, as a child of that reply', async () => {
    const app = await appWith(
      [
        cm({ id: 'c-top', authorId: 'u-third' }),
        cm({ id: 'c-mid', authorId: FX_OTHER, parentId: 'c-top', depth: 1 }),
      ],
      { timers: true },
    );
    const { id } = await post(app, {
      kind: 'COMMENT',
      parentId: 'c-mid',
      body: doc('Could you add a Unity 6 version?'),
    });
    await tick(6_000);
    const [reply] = await sims(app);
    expect(reply).toMatchObject({ parentId: id, depth: 3, authorId: FX_OTHER });
    const tree = await app.call<CommentListResponse>('GET', '/assets/a-fx-001/comments');
    expect(flat(tree.items).map((n) => n.id)).toContain(reply!.id);
  });

  it('answers an issue once per issue (not again for later replies in the thread)', async () => {
    const app = await appWith([], { timers: true });
    const { id } = await post(app, { kind: 'ISSUE', body: doc('Shader turns pink in URP') });
    await tick(6_000);
    expect(await sims(app)).toHaveLength(1);
    expect((await sims(app))[0]!.parentId).toBe(id);
    // The persona follows up inside the issue thread: no second automatic answer.
    await post(app, { kind: 'COMMENT', parentId: id, body: doc('Any update on this?') });
    await tick(30_000);
    expect(await sims(app)).toHaveLength(1);
  });

  it('does nothing when timers are disabled', async () => {
    const app = await appWith([], { timers: false });
    await post(app, { kind: 'COMMENT', body: doc('hello?') });
    expect(vi.getTimerCount()).toBe(0);
    await tick(60_000);
    expect(await sims(app)).toHaveLength(0);
    expect(await inbox(app)).toHaveLength(0);
  });

  it('does not reply on an asset the persona owns, nor when the persona changes an issue status', async () => {
    const app = await appWith(
      [cm({ id: 'c-issue', assetId: 'a-mine', kind: 'ISSUE', issueStatus: 'OPEN' })],
      { timers: true },
    );
    await post(app, { kind: 'COMMENT', body: doc('note to self') }, 'a-mine');
    await app.call('PATCH', '/comments/c-issue/status', { body: { status: 'RESOLVED' } });
    await tick(60_000);
    expect(await sims(app)).toHaveLength(0);
    expect(await inbox(app)).toHaveLength(0);
  });

  it('never fires twice for the same parent, even if scheduled twice or an owner reply exists', async () => {
    const app = await appWith([cm({ id: 'c-p', authorId: FX_PERSONA })], { timers: true });
    expect(scheduleSimulatedReply(app.ctx, 'c-p')).toBe(true);
    expect(scheduleSimulatedReply(app.ctx, 'c-p')).toBe(false);
    await tick(6_000);
    expect(await sims(app)).toHaveLength(1);
    expect(scheduleSimulatedReply(app.ctx, 'c-p')).toBe(false);
    await tick(10_000);
    expect(await sims(app)).toHaveLength(1);
    expect(await inbox(app)).toHaveLength(1);

    // A different "page session" (fresh module state) must still find the owner reply in the Db:
    // an owner-authored child already exists for c-q, so nothing is added.
    const app2 = await appWith(
      [
        cm({ id: 'c-q', authorId: FX_PERSONA }),
        cm({ id: 'c-q-owner', authorId: FX_OTHER, parentId: 'c-q', depth: 1 }),
      ],
      { timers: true },
    );
    scheduleSimulatedReply(app2.ctx, 'c-q');
    await tick(6_000);
    expect(await sims(app2)).toHaveLength(0);
  });

  it('skips quietly when the parent was deleted, removed or the demo was reset meanwhile', async () => {
    const app = await appWith(
      [
        cm({ id: 'c-soft', authorId: FX_PERSONA }),
        cm({ id: 'c-hard', authorId: FX_PERSONA }),
        cm({ id: 'c-reset', authorId: FX_PERSONA }),
      ],
      { timers: true },
    );
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    scheduleSimulatedReply(app.ctx, 'c-soft');
    scheduleSimulatedReply(app.ctx, 'c-hard');
    await app.call('DELETE', '/comments/c-soft');
    await app.db.remove('comments', 'c-hard');
    await tick(6_000);
    expect(await sims(app)).toHaveLength(0);
    expect(await inbox(app)).toHaveLength(0);

    scheduleSimulatedReply(app.ctx, 'c-reset');
    await app.db.reset();
    await tick(6_000);
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('skips when the reply would exceed the depth cap, the author is not the persona or the owner is unknown', async () => {
    const chain: CommentRecord[] = [];
    for (let d = 0; d <= 4; d += 1) {
      chain.push(
        cm({
          id: `c-d${d}`,
          depth: d,
          parentId: d === 0 ? null : `c-d${d - 1}`,
          authorId: FX_PERSONA,
        }),
      );
    }
    const app = await appWith(
      [
        ...chain,
        cm({ id: 'c-foreign', authorId: 'u-third' }),
        cm({ id: 'c-orphan', assetId: 'a-orphan', authorId: FX_PERSONA }),
      ],
      { timers: true },
    );
    scheduleSimulatedReply(app.ctx, 'c-d4');
    scheduleSimulatedReply(app.ctx, 'c-foreign');
    scheduleSimulatedReply(app.ctx, 'c-orphan');
    scheduleSimulatedReply(app.ctx, 'c-unknown');
    await tick(6_000);
    expect(await sims(app)).toHaveLength(0);
  });

  it('honours an injected delay', async () => {
    const app = await appWith([cm({ id: 'c-p', authorId: FX_PERSONA })], { timers: true });
    scheduleSimulatedReply(app.ctx, 'c-p', { delayMs: 250 });
    await tick(249);
    expect(await sims(app)).toHaveLength(0);
    await tick(2);
    expect(await sims(app)).toHaveLength(1);
  });

  it('the reply is a real comment: the persona can reply to it and it appears as an owner reply in the tree', async () => {
    const app = await appWith([], { timers: true });
    const { id } = await post(app, { kind: 'COMMENT', body: doc('Great stuff') });
    await tick(6_000);
    const [sim] = await sims(app);
    const nested = await post(app, { kind: 'COMMENT', parentId: sim!.id, body: doc('Cheers!') });
    const tree = await app.call<CommentListResponse>('GET', '/assets/a-fx-001/comments');
    const byId = new Map<string, CommentNode>(flat(tree.items).map((n) => [n.id, n]));
    expect(byId.get(nested.id)!.parentId).toBe(sim!.id);
    expect(byId.get(sim!.id)!.parentId).toBe(id);
  });
});

describe('classifyComment', () => {
  it('prefers question over praise and treats issues as bug reports', () => {
    expect(classifyComment(doc('Thanks! Does it work with HDRP?'), 'COMMENT')).toBe('question');
    expect(classifyComment(doc('Great, thanks'), 'COMMENT')).toBe('praise');
    expect(classifyComment(doc('Great, thanks'), 'ISSUE')).toBe('bug');
    expect(classifyComment(doc('how to import'), 'COMMENT')).toBe('question');
    expect(classifyComment(doc('Textures not working in the build'), 'COMMENT')).toBe('bug');
    expect(classifyComment(doc('Used it yesterday'), 'COMMENT')).toBe('other');
  });
});
