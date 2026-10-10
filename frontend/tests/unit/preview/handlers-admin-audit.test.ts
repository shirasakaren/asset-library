import { describe, it, expect } from 'vitest';
import type { AdminAuditPage, AuditEntry } from '@/lib/api/admin-types';
import type { AuditRecord } from '@/preview/records';
import { recordAudit } from '@/preview/handlers/audit-core';
import { adminApp, fixtureAudit, FX_OTHER, FX_PERSONA, status } from './admin-fixtures';

type App = Awaited<ReturnType<typeof adminApp>>;
const list = (app: App, query: Record<string, unknown> = {}) =>
  app.call<AdminAuditPage>('GET', '/admin/audit', { query });

/** Walks every page; returns the ids in order. */
async function walk(app: App, query: Record<string, unknown> = {}): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 100; i += 1) {
    const page = await list(app, { ...query, cursor });
    ids.push(...page.items.map((x) => x.id));
    if (!page.pageInfo.hasMore) return ids;
    expect(page.pageInfo.nextCursor).toBeTruthy();
    cursor = page.pageInfo.nextCursor!;
  }
  throw new Error('pagination did not end');
}

describe('GET /admin/audit', () => {
  it('lists newest first with the actor columns filled in', async () => {
    const app = await adminApp();
    const page = await list(app, { limit: 3 });
    expect(page.items.map((x) => x.id)).toEqual(['au-012', 'au-011', 'au-010']);
    expect(page.pageInfo.hasMore).toBe(true);
    expect(page.items[0]).toEqual({
      id: 'au-012',
      action: 'tag.update',
      subjectType: 'Tag',
      subjectId: 'tag-lava',
      actorId: FX_OTHER,
      actorDisplayName: 'Kenji Matsuda',
      actorEmail: 'kenji@example.test',
      metadata: null,
      createdAt: '2026-05-31T23:00:00.000Z',
    });
    // au-010 is a system job
    expect(page.items[2]).toMatchObject({
      actorId: null,
      actorDisplayName: null,
      actorEmail: null,
    });
  });

  it('pages through every row exactly once (default limit 24, limit clamped to 100)', async () => {
    const rows = fixtureAudit(130);
    const app = await adminApp({}, { audit: rows });
    expect((await list(app)).items).toHaveLength(24);
    expect((await list(app, { limit: 500 })).items).toHaveLength(100);
    const ids = await walk(app, { limit: 17 });
    expect(ids).toHaveLength(130);
    expect(new Set(ids).size).toBe(130);
    expect(ids[0]).toBe('au-130');
    expect(ids[129]).toBe('au-001');
  });

  it('breaks createdAt ties by id descending and the walk stays duplicate free', async () => {
    const same = '2026-06-01T00:00:00.000Z';
    const tied: AuditRecord[] = ['au-b', 'au-d', 'au-a', 'au-c', 'au-e'].map((id) => ({
      id,
      action: 'x.y',
      subjectType: 'Asset',
      subjectId: 'a-fx-001',
      actorId: FX_PERSONA,
      metadata: null,
      createdAt: same,
    }));
    const app = await adminApp({}, { audit: [...tied, ...fixtureAudit(3)] });
    const ids = await walk(app, { limit: 2 });
    expect(ids).toEqual(['au-e', 'au-d', 'au-c', 'au-b', 'au-a', 'au-003', 'au-002', 'au-001']);
  });

  it('filters by actor, subject, action and subject type (and by all of them)', async () => {
    const app = await adminApp();
    const ids = async (q: Record<string, unknown>) => (await walk(app, q)).sort();
    expect(await ids({ actorId: FX_PERSONA })).toEqual([
      'au-001',
      'au-003',
      'au-007',
      'au-009',
      'au-011',
    ]);
    expect(await ids({ action: 'tag.update' })).toHaveLength(6);
    expect(await ids({ subjectType: 'Tag' })).toHaveLength(6);
    expect(await ids({ subjectId: 'a-fx-001' })).toHaveLength(6);
    expect(await ids({ subjectId: 'a-fx-001', actorId: FX_OTHER })).toEqual([]);
    expect(
      await ids({ action: 'asset.admin_edit', subjectType: 'Asset', actorId: FX_PERSONA }),
    ).toEqual(await ids({ actorId: FX_PERSONA }));
    expect(await ids({ actorId: 'nobody' })).toEqual([]);
  });

  it('filters by from and to (inclusive), as ISO dates or date-times', async () => {
    const app = await adminApp();
    // au-012 is at 23:00, au-011 at 22:59, ...
    const r1 = await list(app, { from: '2026-05-31T22:58:00.000Z' });
    expect(r1.items.map((x) => x.id)).toEqual(['au-012', 'au-011', 'au-010']);
    const r2 = await list(app, { to: '2026-05-31T22:49:00.000Z' });
    expect(r2.items.map((x) => x.id)).toEqual(['au-001']);
    const r3 = await list(app, {
      from: '2026-05-31T22:52:00.000Z',
      to: '2026-05-31T22:54:00.000Z',
    });
    expect(r3.items.map((x) => x.id)).toEqual(['au-006', 'au-005', 'au-004']);
    expect((await list(app, { from: '2026-05-31' })).items).toHaveLength(12);
    expect((await list(app, { from: '2026-06-01' })).items).toEqual([]);
  });

  it('rejects a malformed date', async () => {
    const app = await adminApp();
    await expect(list(app, { from: 'yesterday' })).rejects.toSatisfy(status(400));
    await expect(list(app, { to: '2026-13-45' })).rejects.toSatisfy(status(400));
  });

  it('an unknown or forged cursor gives an empty page', async () => {
    const app = await adminApp();
    expect((await list(app, { cursor: '!!!' })).items).toEqual([]);
  });

  it('lists rows written by the handlers (recordAudit) at the top, in the seed row shape', async () => {
    const app = await adminApp();
    const row = await recordAudit(app.ctx, {
      action: 'user.promote',
      subjectType: 'User',
      subjectId: 'u-third',
      metadata: { role: 'admin' },
    });
    const page = await list(app, { limit: 2 });
    expect(page.items[0]).toEqual({
      id: row.id,
      action: 'user.promote',
      subjectType: 'User',
      subjectId: 'u-third',
      actorId: FX_PERSONA,
      actorDisplayName: 'Aria Wijaya',
      actorEmail: 'aria@example.test',
      metadata: { role: 'admin' },
      createdAt: '2026-06-10T12:00:00.000Z',
    });
    expect(page.items[1]!.id).toBe('au-012');
    // same keys as a seeded row
    const seeded = (await list(app)).items.find((x) => x.id === 'au-012') as AuditEntry;
    expect(Object.keys(page.items[0]!).sort()).toEqual(Object.keys(seeded).sort());
  });

  it('is admin-only', async () => {
    const app = await adminApp({ meId: FX_OTHER });
    await expect(list(app)).rejects.toSatisfy(status(403));
  });
});

describe('GET /admin/audit/{id}', () => {
  it('returns one entry with its metadata and actor', async () => {
    const app = await adminApp();
    const entry = await app.call<AuditEntry>('GET', '/admin/audit/au-001');
    expect(entry).toEqual({
      id: 'au-001',
      action: 'asset.admin_edit',
      subjectType: 'Asset',
      subjectId: 'a-fx-001',
      actorId: FX_PERSONA,
      actorDisplayName: 'Aria Wijaya',
      actorEmail: 'aria@example.test',
      metadata: { reason: 'r0' },
      createdAt: '2026-05-31T22:49:00.000Z',
    });
  });

  it('404s for an unknown id and is admin-only', async () => {
    const app = await adminApp();
    await expect(app.call('GET', '/admin/audit/au-nope')).rejects.toSatisfy(
      status(404, 'audit.not_found'),
    );
    const other = await adminApp({ meId: FX_OTHER });
    await expect(other.call('GET', '/admin/audit/au-001')).rejects.toSatisfy(status(403));
  });
});
