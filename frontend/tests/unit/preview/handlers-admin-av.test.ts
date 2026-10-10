import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminAvRow, DashboardResponse } from '@/lib/api/admin-types';
import type { AssetRecord } from '@/preview/records';
import { SCHEDULED_RESCAN_MS } from '@/preview/handlers/admin/av';
import { assetsApp, newAudits, status } from './admin-fixtures';

type App = Awaited<ReturnType<typeof assetsApp>>;

/** a-fx-001 (published) has an INFECTED 1.0.0; a-arch (archived) one too; a-draft a CLEAN one. */
async function avApp() {
  const app = await assetsApp();
  for (const id of ['a-fx-001', 'a-arch']) {
    const a = (await app.db.get<AssetRecord>('assets', id))!;
    await app.db.patch<AssetRecord>('assets', id, {
      versions: a.versions.map((v) => ({ ...v, avStatus: 'INFECTED' as const })),
    });
  }
  return app;
}

const list = (app: App) => app.call<AdminAvRow[]>('GET', '/admin/av/infected');
const post = (app: App, versionId: string, action: 'quarantine' | 'acknowledge' | 'rescan') =>
  app.call('POST', `/admin/av/${versionId}/${action}`);
const dashboardCount = async (app: App) =>
  (await app.call<DashboardResponse>('GET', '/admin/dashboard')).counts.avInfected;
const version = async (app: App, assetId: string) =>
  (await app.db.get<AssetRecord>('assets', assetId))!.versions[0]!;
const V1 = 'v-fx-001-1-0-0';
const VARCH = 'v-arch-1-0-0';

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /admin/av/infected', () => {
  it('lists the infected versions with asset, owner and file info, newest version first', async () => {
    const app = await avApp();
    await app.db.patch<AssetRecord>('assets', 'a-fx-001', {
      versions: [
        {
          ...(await version(app, 'a-fx-001')),
          createdAt: '2026-05-20T00:00:00.000Z',
        },
      ],
    });
    const rows = await list(app);
    expect(rows.map((r) => r.versionId)).toEqual([V1, VARCH]);
    expect(rows[0]).toEqual({
      versionId: V1,
      semver: '1.0.0',
      avStatus: 'INFECTED',
      acknowledgedAt: null,
      createdAt: '2026-05-20T00:00:00.000Z',
      assetId: 'a-fx-001',
      assetSlug: 'fx-001',
      assetTitle: 'Fixture Item 001',
      assetStatus: 'PUBLISHED',
      ownerId: 'u-other',
      ownerDisplayName: 'Kenji Matsuda',
      ownerEmail: 'kenji@example.test',
      files: [{ id: 'f-fx-001-1-0-0', relativePath: 'fx-001-1.0.0.txt', bytes: '10' }],
    });
    expect(rows[1]).toMatchObject({ assetStatus: 'ARCHIVED' });
  });

  it('leaves out clean versions and soft-deleted assets', async () => {
    const app = await avApp();
    const gone = (await app.db.get<AssetRecord>('assets', 'a-gone'))!;
    await app.db.patch<AssetRecord>('assets', 'a-gone', {
      versions: gone.versions.map((v) => ({ ...v, avStatus: 'INFECTED' as const })),
    });
    expect((await list(app)).map((r) => r.assetId).sort()).toEqual(['a-arch', 'a-fx-001']);
    await post(app, V1, 'acknowledge');
    expect((await list(app)).map((r) => r.assetId)).toEqual(['a-arch']);
  });

  it('is an empty list when nothing is infected', async () => {
    const app = await assetsApp();
    expect(await list(app)).toEqual([]);
  });
});

describe('POST /admin/av/{versionId}/quarantine', () => {
  it('archives the parent asset and audits both the archive and the quarantine', async () => {
    const app = await avApp();
    expect(await post(app, V1, 'quarantine')).toBeUndefined();
    expect((await app.db.get<AssetRecord>('assets', 'a-fx-001'))!.status).toBe('ARCHIVED');
    // the version is still infected: the stat card keeps counting it until it is acknowledged
    expect((await version(app, 'a-fx-001')).avStatus).toBe('INFECTED');
    expect(await dashboardCount(app)).toBe(2);
    expect((await list(app)).find((r) => r.versionId === V1)!.assetStatus).toBe('ARCHIVED');
    const rows = await newAudits(app);
    expect(rows.map((r) => r.action)).toEqual(['asset.admin_archive', 'av.quarantine']);
    expect(rows[0]).toMatchObject({
      subjectType: 'Asset',
      subjectId: 'a-fx-001',
      metadata: { previousStatus: 'PUBLISHED', reason: 'AV quarantine' },
    });
    expect(rows[1]).toMatchObject({
      subjectType: 'AssetVersion',
      subjectId: V1,
      actorId: 'u-persona',
      metadata: { assetId: 'a-fx-001' },
    });
  });

  it('is fine for an asset that is already archived, and writes the quarantine row only', async () => {
    const app = await avApp();
    await post(app, VARCH, 'quarantine');
    expect((await app.db.get<AssetRecord>('assets', 'a-arch'))!.status).toBe('ARCHIVED');
    expect((await newAudits(app)).map((r) => r.action)).toEqual(['av.quarantine']);
  });

  it('cannot archive a draft (asset.archive_blocked) and writes nothing', async () => {
    const app = await avApp();
    const draft = (await app.db.get<AssetRecord>('assets', 'a-draft'))!;
    await app.db.patch<AssetRecord>('assets', 'a-draft', {
      versions: draft.versions.map((v) => ({ ...v, avStatus: 'INFECTED' as const })),
    });
    await expect(post(app, draft.versions[0]!.id, 'quarantine')).rejects.toSatisfy(
      status(400, 'asset.archive_blocked'),
    );
    expect(await newAudits(app)).toEqual([]);
  });

  it('is a 409 for a version that is not infected', async () => {
    const app = await avApp();
    await expect(post(app, 'v-fx-002-1-0-0', 'quarantine')).rejects.toSatisfy(
      status(409, 'av.not_infected'),
    );
  });
});

describe('POST /admin/av/{versionId}/acknowledge', () => {
  it('marks a false positive: CLEAN with the acknowledgement time, and the stat card drops it', async () => {
    const app = await avApp();
    expect(await dashboardCount(app)).toBe(2);
    expect(await post(app, V1, 'acknowledge')).toBeUndefined();
    expect(await version(app, 'a-fx-001')).toMatchObject({
      avStatus: 'CLEAN',
      avAcknowledgedAt: '2026-06-10T12:00:00.000Z',
    });
    expect(await dashboardCount(app)).toBe(1);
    const rows = await newAudits(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'av.acknowledge',
      subjectType: 'AssetVersion',
      subjectId: V1,
      metadata: { assetId: 'a-fx-001' },
    });
  });

  it('lets the version be downloaded again', async () => {
    const app = await avApp();
    const download = () =>
      app.call('POST', '/downloads', {
        body: { assetId: 'a-fx-001', versionId: V1, source: 'WEB' },
      });
    await expect(download()).rejects.toSatisfy(status(403, 'av.infected'));
    await post(app, V1, 'acknowledge');
    await expect(download()).resolves.toBeDefined();
  });

  it('is a 409 for a version that is not infected and a 404 for an unknown one', async () => {
    const app = await avApp();
    await expect(post(app, 'v-fx-002-1-0-0', 'acknowledge')).rejects.toSatisfy(
      status(409, 'av.not_infected'),
    );
    await expect(post(app, 'v-nope', 'acknowledge')).rejects.toSatisfy(
      status(404, 'version.not_found'),
    );
    await expect(post(app, 'v-gone-1-0-0', 'acknowledge')).rejects.toSatisfy(
      status(404, 'version.not_found'),
    );
    expect(await newAudits(app)).toEqual([]);
  });
});

describe('POST /admin/av/{versionId}/rescan', () => {
  it('re-queues the scan; two seconds later the link file scans CLEAN', async () => {
    vi.useFakeTimers({ now: new Date('2026-06-10T12:00:00.000Z') });
    const app = await avApp();
    app.ctx.timers = true;
    const events: unknown[] = [];
    const emit = app.ctx.emit;
    app.ctx.emit = (e) => {
      events.push(e);
      emit(e);
    };
    expect(await post(app, V1, 'rescan')).toBeUndefined();
    expect((await version(app, 'a-fx-001')).avStatus).toBe('INFECTED');
    expect(await dashboardCount(app)).toBe(2);

    await vi.advanceTimersByTimeAsync(SCHEDULED_RESCAN_MS - 1);
    expect((await version(app, 'a-fx-001')).avStatus).toBe('INFECTED');
    await vi.advanceTimersByTimeAsync(2);
    expect(await version(app, 'a-fx-001')).toMatchObject({
      avStatus: 'CLEAN',
      avAcknowledgedAt: null,
    });
    expect(await dashboardCount(app)).toBe(1);
    expect(events).toContainEqual({ type: 'assets.changed' });
    expect((await list(app)).map((r) => r.versionId)).toEqual([VARCH]);
    const rows = await newAudits(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'av.rescan',
      subjectType: 'AssetVersion',
      subjectId: V1,
      metadata: { assetId: 'a-fx-001' },
    });
  });

  it('schedules one scan per version and survives the asset being deleted meanwhile', async () => {
    vi.useFakeTimers({ now: new Date('2026-06-10T12:00:00.000Z') });
    const app = await avApp();
    app.ctx.timers = true;
    await post(app, V1, 'rescan');
    await post(app, V1, 'rescan');
    await app.call('POST', '/admin/assets/a-fx-001/force-delete', {
      body: {
        reason: 'Gone for good',
        confirm: 'I understand',
        confirmedAt: new Date().toISOString(),
      },
    });
    await vi.advanceTimersByTimeAsync(SCHEDULED_RESCAN_MS + 10);
    expect(await app.db.get('assets', 'a-fx-001')).toBeUndefined();
    expect((await newAudits(app)).filter((r) => r.action === 'av.rescan')).toHaveLength(2);
  });

  it('only records the request when timers are off (tests): the version is left as it is', async () => {
    const app = await avApp();
    await post(app, V1, 'rescan');
    expect((await version(app, 'a-fx-001')).avStatus).toBe('INFECTED');
  });

  it('keeps a clean version clean and is a 404 for an unknown or deleted one', async () => {
    vi.useFakeTimers({ now: new Date('2026-06-10T12:00:00.000Z') });
    const app = await avApp();
    app.ctx.timers = true;
    await post(app, 'v-fx-002-1-0-0', 'rescan');
    await vi.advanceTimersByTimeAsync(SCHEDULED_RESCAN_MS + 10);
    expect((await version(app, 'a-fx-002')).avStatus).toBe('CLEAN');
    await expect(post(app, 'v-nope', 'rescan')).rejects.toSatisfy(status(404, 'version.not_found'));
    await expect(post(app, 'v-gone-1-0-0', 'rescan')).rejects.toSatisfy(
      status(404, 'version.not_found'),
    );
  });
});
