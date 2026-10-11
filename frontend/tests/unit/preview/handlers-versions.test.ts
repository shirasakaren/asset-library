import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { VersionSummary } from '@/lib/api/types';
import type { AssetRecord, AssetVersionRecord, NotificationRecord } from '@/preview/records';
import { bus, type PreviewEvent } from '@/preview/events/bus';
import {
  attachFileToVersion,
  notifyVersionPublished,
  recomputeVersionTotals,
  removeFileFromVersion,
  scheduleAnalysis,
  SCHEDULED_ANALYSIS_MS,
} from '@/preview/handlers/versions';
import {
  appForWrites,
  detail,
  doc,
  EMPTY_DOC,
  FX_OTHER,
  recordEvents,
  status,
  storedOrThrow,
  wizardCreateBody,
  type App,
} from './publish-fixtures';

const now = '2026-04-01T00:00:00.000Z';

/** A fixture-shaped version of `a-mine-pub` / `a-mine-draft` with overrides. */
const ver = (
  over: Partial<AssetVersionRecord> & { id: string; semver: string },
): AssetVersionRecord => ({
  releaseNotes: null,
  publishedAt: null,
  isLatest: false,
  analysisStatus: 'READY',
  bytesTotal: '10',
  fileCount: 1,
  files: [
    {
      id: `f-${over.id}`,
      relativePath: `${over.id}.txt`,
      kind: 'OTHER',
      bytes: '10',
      meta: { content: 'x' },
    },
  ],
  compatibility: [{ engineVersion: '2022.3', renderPipelines: ['URP'], targets: ['WINDOWS'] }],
  dependencies: [],
  requiresEmptyProject: false,
  createdAt: now,
  avStatus: 'CLEAN',
  avAcknowledgedAt: null,
  ...over,
});

const listVersions = (app: App, id: string) =>
  app.call<VersionSummary[]>('GET', `/assets/${id}/versions`);
const createVersion = (app: App, id: string, body: unknown) =>
  app.call<{ id: string }>('POST', `/assets/${id}/versions`, { body });
const patchVersion = (app: App, id: string, vid: string, body: unknown) =>
  app.call<undefined>('PATCH', `/assets/${id}/versions/${vid}`, { body });
const publishVersion = (app: App, id: string, vid: string) =>
  app.call<undefined>('POST', `/assets/${id}/versions/${vid}/publish`);
const setCompat = (app: App, id: string, vid: string, rows: unknown) =>
  app.call<undefined>('POST', `/assets/${id}/versions/${vid}/compatibility`, { body: { rows } });
const reanalyze = (app: App, id: string, vid: string) =>
  app.call<undefined>('POST', `/assets/${id}/versions/${vid}/reanalyze`);

const latestIds = async (app: App, id: string) =>
  (await storedOrThrow(app, id)).versions.filter((v) => v.isLatest).map((v) => v.id);

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
});
const record = () => {
  const r = recordEvents();
  stop = r.stop;
  return r.events;
};

/** Persona-owned asset with three versions: 1.0.0 (published, latest), 1.1.0 and 1.2.0 (drafts with a file). */
async function withDrafts(opts: { meId?: string; timers?: boolean } = { timers: false }) {
  const app = await appForWrites(opts);
  const a = await storedOrThrow(app, 'a-mine-pub');
  await app.db.patch<AssetRecord>('assets', 'a-mine-pub', {
    versions: [
      { ...a.versions[0]!, createdAt: '2026-03-02T00:00:00.000Z' },
      ver({ id: 'v-110', semver: '1.1.0', createdAt: '2026-03-10T00:00:00.000Z' }),
      ver({ id: 'v-120', semver: '1.2.0', createdAt: '2026-03-11T00:00:00.000Z' }),
    ],
  });
  return app;
}

describe('GET /assets/{assetId}/versions', () => {
  it('lists VersionSummary rows, newest created first, for the owner', async () => {
    const app = await withDrafts();
    const rows = await listVersions(app, 'a-mine-pub');
    expect(rows.map((r) => r.semver)).toEqual(['1.2.0', '1.1.0', '1.0.0']);
    expect(rows[2]).toEqual({
      id: 'v-mine-pub-1-0-0',
      semver: '1.0.0',
      isLatest: true,
      analysisStatus: 'READY',
      publishedAt: '2026-03-02T00:00:00.000Z',
      bytesTotal: '10',
      fileCount: 1,
      createdAt: '2026-03-02T00:00:00.000Z',
    });
    expect(Object.keys(rows[0]!).sort()).toEqual([
      'analysisStatus',
      'bytesTotal',
      'createdAt',
      'fileCount',
      'id',
      'isLatest',
      'publishedAt',
      'semver',
    ]);
  });

  it('other users only see published, READY versions; invisible assets are 404', async () => {
    const app = await withDrafts({ meId: FX_OTHER, timers: false });
    expect((await listVersions(app, 'a-mine-pub')).map((r) => r.semver)).toEqual(['1.0.0']);
    await expect(listVersions(app, 'a-mine-draft')).rejects.toSatisfy(
      status(404, 'asset.not_found'),
    );
    await expect(listVersions(app, 'a-gone')).rejects.toSatisfy(status(404));
    await expect(listVersions(app, 'a-nope')).rejects.toSatisfy(status(404));
  });

  it('accepts a slug and works for any published asset (download popup)', async () => {
    const app = await appForWrites({ timers: false });
    expect((await listVersions(app, 'fx-001')).map((r) => r.semver)).toEqual(['1.0.0']);
  });
});

describe('POST /assets/{assetId}/versions', () => {
  it('creates a DRAFT version that is not the latest; asset updatedAt and event', async () => {
    const app = await withDrafts();
    app.ctx.now = () => new Date('2026-08-08T08:08:08.800Z');
    const events = record();
    const res = await createVersion(app, 'a-mine-pub', { semver: '2.0.0' });
    expect(res.id).toMatch(/^v-/);
    const a = await storedOrThrow(app, 'a-mine-pub');
    const v = a.versions.find((x) => x.id === res.id)!;
    expect(v).toMatchObject({
      semver: '2.0.0',
      isLatest: false,
      publishedAt: null,
      analysisStatus: 'PENDING',
      fileCount: 0,
      bytesTotal: '0',
      files: [],
      compatibility: [],
      createdAt: '2026-08-08T08:08:08.000Z',
      releaseNotes: null,
      avStatus: 'CLEAN',
    });
    expect(a.updatedAt).toBe('2026-08-08T08:08:08.000Z');
    expect(await latestIds(app, 'a-mine-pub')).toEqual(['v-mine-pub-1-0-0']);
    expect(events).toContainEqual({ type: 'assets.changed' });
    // newest by semver first in the asset detail
    const d = await detail(app, 'a-mine-pub');
    expect(d.versions.map((x) => x.semver)).toEqual(['2.0.0', '1.2.0', '1.1.0', '1.0.0']);
  });

  it('semver must be MAJOR.MINOR.PATCH (400 version.semver_invalid)', async () => {
    const app = await withDrafts();
    for (const semver of ['1.0', 'v2.0.0', '2.0.0-beta', '', ' 2.0.0', 5, undefined]) {
      const err = (await createVersion(app, 'a-mine-pub', { semver }).catch((e) => e)) as ApiError;
      expect(err.status, String(semver)).toBe(400);
      expect(err.code, String(semver)).toBe('version.semver_invalid');
      expect(err.fields?.[0]?.path).toBe('semver');
    }
  });

  it('an equal semver is a 409 version.duplicate, a lower one a 400, a higher one works', async () => {
    const app = await withDrafts();
    await expect(createVersion(app, 'a-mine-pub', { semver: '1.2.0' })).rejects.toSatisfy(
      status(409, 'version.duplicate'),
    );
    await expect(createVersion(app, 'a-mine-pub', { semver: '1.0.0' })).rejects.toSatisfy(
      status(409, 'version.duplicate'),
    );
    // lower than the highest existing version (1.2.0), though not a duplicate
    await expect(createVersion(app, 'a-mine-pub', { semver: '1.1.5' })).rejects.toSatisfy(
      status(400, 'version.semver_invalid'),
    );
    await expect(createVersion(app, 'a-mine-pub', { semver: '0.9.0' })).rejects.toSatisfy(
      status(400, 'version.semver_invalid'),
    );
    await expect(createVersion(app, 'a-mine-pub', { semver: '1.2.1' })).resolves.toEqual({
      id: expect.any(String),
    });
    // numeric, not lexical: 1.10.0 > 1.9.0
    await expect(createVersion(app, 'a-mine-pub', { semver: '1.10.0' })).resolves.toBeDefined();
    await expect(createVersion(app, 'a-mine-pub', { semver: '1.9.0' })).rejects.toSatisfy(
      status(400),
    );
  });

  it('stores release notes per locale (lite TipTap), dropping unknown keys and empty values', async () => {
    const app = await withDrafts();
    const { id } = await createVersion(app, 'a-mine-pub', {
      semver: '3.0.0',
      releaseNotes: { en: doc('English'), id: doc('Indonesia'), fr: doc('nope') },
    });
    const v = (await storedOrThrow(app, 'a-mine-pub')).versions.find((x) => x.id === id)!;
    expect(v.releaseNotes).toEqual({ en: doc('English'), id: doc('Indonesia') });

    // what new-version-form sends when nothing was written
    const empty = await createVersion(app, 'a-mine-pub', { semver: '3.1.0', releaseNotes: {} });
    const e = (await storedOrThrow(app, 'a-mine-pub')).versions.find((x) => x.id === empty.id)!;
    expect(e.releaseNotes).toBeNull();
    const noNotes = await createVersion(app, 'a-mine-pub', { semver: '3.2.0' });
    expect(
      (await storedOrThrow(app, 'a-mine-pub')).versions.find((x) => x.id === noNotes.id)!
        .releaseNotes,
    ).toBeNull();
  });

  it('rejects release notes with disallowed nodes or the wrong shape', async () => {
    const app = await withDrafts();
    const bad = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }] };
    const err = (await createVersion(app, 'a-mine-pub', {
      semver: '3.0.0',
      releaseNotes: { en: bad },
    }).catch((e) => e)) as ApiError;
    expect(err.status).toBe(400);
    expect(err.code).toBe('comment.lite_tiptap_violation');
    await expect(
      createVersion(app, 'a-mine-pub', { semver: '3.0.0', releaseNotes: 'x' }),
    ).rejects.toSatisfy(status(400));
    await expect(createVersion(app, 'a-mine-pub', 'nope')).rejects.toSatisfy(status(400));
    expect((await storedOrThrow(app, 'a-mine-pub')).versions).toHaveLength(3);
  });

  it('authorization: other draft 404, other published 403, unknown 404, admin allowed', async () => {
    const non = await withDrafts({ meId: FX_OTHER, timers: false });
    await expect(createVersion(non, 'a-mine-draft', { semver: '2.0.0' })).rejects.toSatisfy(
      status(404),
    );
    await expect(createVersion(non, 'a-mine-pub', { semver: '2.0.0' })).rejects.toSatisfy(
      status(403, 'auth.forbidden'),
    );
    await expect(createVersion(non, 'a-nope', { semver: '2.0.0' })).rejects.toSatisfy(status(404));
    await expect(createVersion(non, 'a-other-draft', { semver: '2.0.0' })).resolves.toBeDefined();
    const admin = await appForWrites({ timers: false });
    await expect(createVersion(admin, 'a-fx-001', { semver: '2.0.0' })).resolves.toBeDefined();
  });

  it('works for a freshly created asset (the wizard flow) and for ids vs slugs', async () => {
    const app = await appForWrites({ timers: false });
    const { id, slug } = await app.call<{ id: string; slug: string }>('POST', '/assets', {
      body: wizardCreateBody(),
    });
    await expect(createVersion(app, slug, { semver: '1.0.1' })).resolves.toBeDefined();
    expect((await listVersions(app, id)).map((v) => v.semver)).toEqual(['1.0.1', '1.0.0']);
  });
});

describe('PATCH /assets/{assetId}/versions/{vid}', () => {
  it('updates release notes of a draft version', async () => {
    const app = await withDrafts();
    const events = record();
    expect(
      await patchVersion(app, 'a-mine-pub', 'v-110', { releaseNotes: { en: doc('Fixes') } }),
    ).toBeUndefined();
    const v = (await storedOrThrow(app, 'a-mine-pub')).versions.find((x) => x.id === 'v-110')!;
    expect(v.releaseNotes).toEqual({ en: doc('Fixes') });
    expect(events).toContainEqual({ type: 'assets.changed' });
    // replace, then clear
    await patchVersion(app, 'a-mine-pub', 'v-110', { releaseNotes: { id: doc('Perbaikan') } });
    expect(
      (await storedOrThrow(app, 'a-mine-pub')).versions.find((x) => x.id === 'v-110')!.releaseNotes,
    ).toEqual({
      id: doc('Perbaikan'),
    });
    await patchVersion(app, 'a-mine-pub', 'v-110', { releaseNotes: {} });
    expect(
      (await storedOrThrow(app, 'a-mine-pub')).versions.find((x) => x.id === 'v-110')!.releaseNotes,
    ).toBeNull();
  });

  it('release notes of a published version can still be edited; its semver cannot', async () => {
    const app = await withDrafts();
    await patchVersion(app, 'a-mine-pub', 'v-mine-pub-1-0-0', {
      releaseNotes: { en: doc('Typo fix') },
    });
    await expect(
      patchVersion(app, 'a-mine-pub', 'v-mine-pub-1-0-0', { semver: '1.0.1' }),
    ).rejects.toSatisfy(status(400, 'version.cannot_change_semver'));
    await expect(
      patchVersion(app, 'a-mine-pub', 'v-mine-pub-1-0-0', { semver: '1.0.0' }),
    ).resolves.toBeUndefined();
  });

  it('semver of a draft: valid and unique', async () => {
    const app = await withDrafts();
    await patchVersion(app, 'a-mine-pub', 'v-120', { semver: '1.3.0' });
    expect(
      (await storedOrThrow(app, 'a-mine-pub')).versions.find((x) => x.id === 'v-120')!.semver,
    ).toBe('1.3.0');
    await expect(patchVersion(app, 'a-mine-pub', 'v-120', { semver: 'x' })).rejects.toSatisfy(
      status(400, 'version.semver_invalid'),
    );
    await expect(patchVersion(app, 'a-mine-pub', 'v-120', { semver: '1.1.0' })).rejects.toSatisfy(
      status(409, 'version.duplicate'),
    );
  });

  it('404s for unknown versions and versions of another asset; empty patch is a no-op', async () => {
    const app = await withDrafts();
    await expect(patchVersion(app, 'a-mine-pub', 'v-nope', {})).rejects.toSatisfy(
      status(404, 'version.not_found'),
    );
    await expect(patchVersion(app, 'a-mine-draft', 'v-110', {})).rejects.toSatisfy(
      status(404, 'version.not_found'),
    );
    const events = record();
    await patchVersion(app, 'a-mine-pub', 'v-110', {});
    expect(events).toEqual([]);
  });

  it('validates the body and authorization', async () => {
    const app = await withDrafts();
    await expect(patchVersion(app, 'a-mine-pub', 'v-110', { releaseNotes: 5 })).rejects.toSatisfy(
      status(400),
    );
    await expect(patchVersion(app, 'a-mine-pub', 'v-110', 'x')).rejects.toSatisfy(status(400));
    const non = await withDrafts({ meId: FX_OTHER, timers: false });
    await expect(patchVersion(non, 'a-mine-pub', 'v-110', {})).rejects.toSatisfy(status(403));
    await expect(patchVersion(non, 'a-mine-draft', 'v-x', {})).rejects.toSatisfy(
      status(404, 'asset.not_found'),
    );
  });
});

describe('POST /assets/{assetId}/versions/{vid}/publish', () => {
  it('publishes, sets publishedAt, makes it the only latest, bumps updatedAt, emits', async () => {
    const app = await withDrafts();
    app.ctx.now = () => new Date('2026-09-01T12:00:00.700Z');
    const events = record();
    expect(await publishVersion(app, 'a-mine-pub', 'v-110')).toBeUndefined();
    const a = await storedOrThrow(app, 'a-mine-pub');
    expect(await latestIds(app, 'a-mine-pub')).toEqual(['v-110']);
    expect(a.versions.find((v) => v.id === 'v-110')!.publishedAt).toBe('2026-09-01T12:00:00.000Z');
    expect(a.versions.find((v) => v.id === 'v-mine-pub-1-0-0')!.publishedAt).toBe(
      '2026-03-02T00:00:00.000Z',
    );
    expect(a.updatedAt).toBe('2026-09-01T12:00:00.000Z');
    expect(events).toContainEqual({ type: 'assets.changed' });
    expect((await detail(app, 'a-mine-pub')).versions.find((v) => v.isLatest)!.semver).toBe(
      '1.1.0',
    );
  });

  it('exactly one latest after publishing in different orders (last published wins, like the backend)', async () => {
    const asc = await withDrafts();
    await publishVersion(asc, 'a-mine-pub', 'v-110');
    await publishVersion(asc, 'a-mine-pub', 'v-120');
    expect(await latestIds(asc, 'a-mine-pub')).toEqual(['v-120']);

    const desc = await withDrafts();
    await publishVersion(desc, 'a-mine-pub', 'v-120');
    await publishVersion(desc, 'a-mine-pub', 'v-110');
    expect(await latestIds(desc, 'a-mine-pub')).toEqual(['v-110']);

    // re-publishing the old latest brings it back; publishedAt is kept
    const before = (await storedOrThrow(desc, 'a-mine-pub')).versions.find(
      (v) => v.id === 'v-120',
    )!.publishedAt;
    await publishVersion(desc, 'a-mine-pub', 'v-120');
    await publishVersion(desc, 'a-mine-pub', 'v-mine-pub-1-0-0');
    const a = await storedOrThrow(desc, 'a-mine-pub');
    expect(a.versions.filter((v) => v.isLatest).map((v) => v.id)).toEqual(['v-mine-pub-1-0-0']);
    expect(a.versions.find((v) => v.id === 'v-120')!.publishedAt).toBe(before);
  });

  it('refuses a version without files (400 asset.publish_blocked) and changes nothing', async () => {
    const app = await withDrafts();
    const { id } = await createVersion(app, 'a-mine-pub', { semver: '5.0.0' });
    const err = (await publishVersion(app, 'a-mine-pub', id).catch((e) => e)) as ApiError;
    expect(err.status).toBe(400);
    expect(err.code).toBe('asset.publish_blocked');
    expect(err.fields).toEqual([
      { path: 'version.files', code: 'version.empty', message: expect.any(String) },
    ]);
    expect(await latestIds(app, 'a-mine-pub')).toEqual(['v-mine-pub-1-0-0']);
  });

  it('does not publish the asset itself (a DRAFT asset stays DRAFT)', async () => {
    const app = await appForWrites({ timers: false });
    const d = await storedOrThrow(app, 'a-mine-draft');
    await app.db.patch<AssetRecord>('assets', 'a-mine-draft', {
      versions: [
        d.versions[0]!,
        ver({ id: 'v-d2', semver: '1.0.1', createdAt: '2026-03-05T00:00:00.000Z' }),
      ],
    });
    await publishVersion(app, 'a-mine-draft', 'v-d2');
    expect((await storedOrThrow(app, 'a-mine-draft')).status).toBe('DRAFT');
  });

  it('404s and authorization', async () => {
    const app = await withDrafts();
    await expect(publishVersion(app, 'a-mine-pub', 'v-nope')).rejects.toSatisfy(
      status(404, 'version.not_found'),
    );
    const non = await withDrafts({ meId: FX_OTHER, timers: false });
    await expect(publishVersion(non, 'a-mine-pub', 'v-110')).rejects.toSatisfy(status(403));
    await expect(publishVersion(non, 'a-mine-draft', 'v-110')).rejects.toSatisfy(status(404));
  });

  it('notifyVersionPublished tells the persona about a version of a saved asset by someone else', async () => {
    const app = await withDrafts();
    await app.call('POST', '/library/items', { body: { assetId: 'a-fx-001' } });
    const asset = await storedOrThrow(app, 'a-fx-001');
    const version = asset.versions[0]!;
    const events = record();

    expect(await notifyVersionPublished(app.ctx, asset, version, FX_OTHER)).toBeDefined();
    const [n] = await app.db.list<NotificationRecord>('notifications');
    expect(n).toMatchObject({
      type: 'VERSION_PUBLISHED',
      readAt: null,
      payload: {
        assetId: 'a-fx-001',
        assetSlug: 'fx-001',
        assetTitle: asset.title,
        versionId: version.id,
        semver: '1.0.0',
        versionLabel: 'v1.0.0',
      },
    });
    expect(events).toContainEqual({ type: 'notification', notificationId: n!.id });

    // not the publisher's own, not for assets outside the library
    expect(await notifyVersionPublished(app.ctx, asset, version, 'u-persona')).toBeUndefined();
    const other = await storedOrThrow(app, 'a-fx-002');
    expect(
      await notifyVersionPublished(app.ctx, other, other.versions[0]!, FX_OTHER),
    ).toBeUndefined();
    expect(await app.db.list('notifications')).toHaveLength(1);
  });

  it('the persona publishing her own version never notifies herself', async () => {
    const app = await withDrafts();
    await publishVersion(app, 'a-mine-pub', 'v-110');
    expect(await app.db.list('notifications')).toEqual([]);
  });
});

describe('POST /assets/{assetId}/versions/{vid}/compatibility', () => {
  const rows = [
    { engineVersion: '2022.3.50f1', renderPipelines: ['URP', 'HDRP'], targets: ['WINDOWS', 'MAC'] },
    { engineVersion: '6000.0', targets: ['ANDROID'] },
  ];

  it('replaces the rows (the wizard sends { rows })', async () => {
    const app = await withDrafts();
    const events = record();
    expect(await setCompat(app, 'a-mine-pub', 'v-110', rows)).toBeUndefined();
    const d = await detail(app, 'a-mine-pub');
    expect(d.versions.find((v) => v.id === 'v-110')!.compatibility).toEqual([
      {
        engineVersion: '2022.3.50f1',
        renderPipelines: ['URP', 'HDRP'],
        targets: ['WINDOWS', 'MAC'],
      },
      { engineVersion: '6000.0', renderPipelines: [], targets: ['ANDROID'] },
    ]);
    expect(events).toContainEqual({ type: 'assets.changed' });
    await setCompat(app, 'a-mine-pub', 'v-110', [rows[1]]);
    expect(
      (await detail(app, 'a-mine-pub')).versions.find((v) => v.id === 'v-110')!.compatibility,
    ).toHaveLength(1);
    await setCompat(app, 'a-mine-pub', 'v-110', []);
    expect(
      (await detail(app, 'a-mine-pub')).versions.find((v) => v.id === 'v-110')!.compatibility,
    ).toEqual([]);
  });

  it('validates rows (shape, lengths, known pipelines and targets)', async () => {
    const app = await withDrafts();
    const bad = async (r: unknown, path: string) => {
      const err = (await setCompat(app, 'a-mine-pub', 'v-110', r).catch((e) => e)) as ApiError;
      expect(err.status, path).toBe(400);
      expect(
        err.fields?.map((f) => f.path),
        path,
      ).toContain(path);
    };
    await bad('x', 'rows');
    await bad(
      Array.from({ length: 21 }, () => rows[0]),
      'rows',
    );
    await bad([5], 'rows[0]');
    await bad([{ targets: ['WINDOWS'] }], 'rows[0].engineVersion');
    await bad([{ engineVersion: 'x'.repeat(41), targets: ['WINDOWS'] }], 'rows[0].engineVersion');
    await bad([{ engineVersion: '1', targets: [] }], 'rows[0].targets');
    await bad([{ engineVersion: '1', targets: ['AMIGA'] }], 'rows[0].targets');
    await bad(
      [{ engineVersion: '1', renderPipelines: ['RAYTRACE'], targets: ['WEB'] }],
      'rows[0].renderPipelines',
    );
    await bad(
      [{ engineVersion: '1', renderPipelines: 'URP', targets: ['WEB'] }],
      'rows[0].renderPipelines',
    );
    await expect(
      app.call('POST', '/assets/a-mine-pub/versions/v-110/compatibility', { body: {} }),
    ).rejects.toSatisfy(status(400));
    // nothing was replaced by the failures
    expect(
      (await detail(app, 'a-mine-pub')).versions.find((v) => v.id === 'v-110')!.compatibility,
    ).toHaveLength(1);
  });

  it('404s and authorization', async () => {
    const app = await withDrafts();
    await expect(setCompat(app, 'a-mine-pub', 'v-nope', [])).rejects.toSatisfy(
      status(404, 'version.not_found'),
    );
    const non = await withDrafts({ meId: FX_OTHER, timers: false });
    await expect(setCompat(non, 'a-mine-pub', 'v-110', [])).rejects.toSatisfy(status(403));
  });
});

describe('analysis scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  const settle = async () => {
    for (let i = 0; i < 60; i += 1) await Promise.resolve();
  };
  const tick = async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms);
    await settle();
  };
  const analysis = async (app: App, id: string, vid: string) =>
    (await storedOrThrow(app, id)).versions.find((v) => v.id === vid)!.analysisStatus;
  const busEvents = () => {
    const events: PreviewEvent[] = [];
    stop = bus.on((e) => events.push(e));
    return events;
  };

  it('scheduleAnalysis: READY after 2 s, version.ready on the bus, only once', async () => {
    const app = await withDrafts({ timers: true });
    await app.db.patch<AssetRecord>('assets', 'a-mine-pub', {
      versions: (await storedOrThrow(app, 'a-mine-pub')).versions.map((v) =>
        v.id === 'v-110' ? { ...v, analysisStatus: 'PENDING' as const } : v,
      ),
    });
    const events = busEvents();
    expect(SCHEDULED_ANALYSIS_MS).toBe(2000);
    expect(scheduleAnalysis(app.ctx, 'a-mine-pub', 'v-110')).toBe(true);
    // a second call while one is pending does not stack another timer
    expect(scheduleAnalysis(app.ctx, 'a-mine-pub', 'v-110')).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
    await tick(1999);
    expect(await analysis(app, 'a-mine-pub', 'v-110')).toBe('PENDING');
    expect(events.filter((e) => e.type === 'version.ready')).toEqual([]);
    await tick(1);
    expect(await analysis(app, 'a-mine-pub', 'v-110')).toBe('READY');
    expect(events.filter((e) => e.type === 'version.ready')).toEqual([
      { type: 'version.ready', assetId: 'a-mine-pub', versionId: 'v-110' },
    ]);
    // it can be scheduled again later
    expect(scheduleAnalysis(app.ctx, 'a-mine-pub', 'v-110')).toBe(true);
  });

  it('does nothing when ctx.timers is false', async () => {
    const app = await withDrafts({ timers: false });
    expect(scheduleAnalysis(app.ctx, 'a-mine-pub', 'v-110')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('an asset deleted before the timer fires is ignored quietly; a READY version is left alone', async () => {
    const app = await withDrafts({ timers: true });
    const events = busEvents();
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    scheduleAnalysis(app.ctx, 'a-mine-pub', 'v-110'); // READY already
    scheduleAnalysis(app.ctx, 'a-mine-draft', 'v-gone');
    await app.call('DELETE', '/assets/a-mine-draft');
    await tick(2500);
    expect(events.filter((e) => e.type === 'version.ready')).toEqual([]);
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('reanalyze marks the version PENDING and then READY after 2 s', async () => {
    const app = await withDrafts({ timers: true });
    const events = busEvents();
    expect(await reanalyze(app, 'a-mine-pub', 'v-110')).toBeUndefined();
    expect(await analysis(app, 'a-mine-pub', 'v-110')).toBe('PENDING');
    await tick(2000);
    expect(await analysis(app, 'a-mine-pub', 'v-110')).toBe('READY');
    expect(events).toContainEqual({
      type: 'version.ready',
      assetId: 'a-mine-pub',
      versionId: 'v-110',
    });
  });

  it('reanalyze with timers disabled leaves the version PENDING without a timer', async () => {
    const app = await withDrafts({ timers: false });
    await reanalyze(app, 'a-mine-pub', 'v-110');
    expect(await analysis(app, 'a-mine-pub', 'v-110')).toBe('PENDING');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reanalyze is a no-op for a version without files; 404 / 403 otherwise', async () => {
    const app = await withDrafts({ timers: true });
    const { id } = await createVersion(app, 'a-mine-pub', { semver: '9.0.0' });
    await reanalyze(app, 'a-mine-pub', id);
    expect(await analysis(app, 'a-mine-pub', id)).toBe('PENDING');
    expect(vi.getTimerCount()).toBe(0);
    await expect(reanalyze(app, 'a-mine-pub', 'v-nope')).rejects.toSatisfy(
      status(404, 'version.not_found'),
    );
    const non = await withDrafts({ meId: FX_OTHER, timers: true });
    await expect(reanalyze(non, 'a-mine-pub', 'v-110')).rejects.toSatisfy(status(403));
  });

  it('end to end: create -> patch -> compatibility -> attach file -> analysis -> publish', async () => {
    const app = await appForWrites({ timers: true });
    const { id } = await app.call<{ id: string }>('POST', '/assets', { body: wizardCreateBody() });
    await app.call('PATCH', `/assets/${id}`, {
      body: {
        title: 'End To End',
        tags: ['e2e'],
        translations: [
          { locale: 'en', shortDescription: 'It works', longDescription: doc('Long') },
        ],
      },
    });
    const first = (await storedOrThrow(app, id)).versions[0]!;
    await setCompat(app, id, first.id, [
      { engineVersion: '2022.3', renderPipelines: ['URP'], targets: ['WINDOWS'] },
    ]);
    // 9b's thumbnail handler does this part
    await app.db.patch<AssetRecord>('assets', id, {
      thumbnail: { key: 'thumbs/e2e.webp', url: '/thumbs/e2e.webp' },
    });

    const blocked = (await app
      .call('POST', `/assets/${id}/publish`, { body: {} })
      .catch((e) => e)) as ApiError;
    expect(blocked.fields?.map((f) => f.code)).toEqual(['version.empty']);

    const file = await attachFileToVersion(app.ctx, {
      assetId: id,
      versionId: first.id,
      file: {
        id: 'f-e2e-1',
        relativePath: 'Pack/E2E.unitypackage',
        kind: 'UNITYPACKAGE',
        bytes: 4096,
      },
    });
    expect(file).toEqual({
      id: 'f-e2e-1',
      relativePath: 'Pack/E2E.unitypackage',
      kind: 'UNITYPACKAGE',
      bytes: '4096',
    });
    // still analysing: publishing is allowed and says so in `warnings` (preview deviation)
    expect(await app.call('POST', `/assets/${id}/publish`, { body: {} })).toEqual({
      warnings: [
        { path: 'version.analysis', code: 'analysis.incomplete', message: expect.any(String) },
      ],
    });
    await tick(2000);
    const d = await detail(app, id);
    expect(d).toMatchObject({ status: 'PUBLISHED', title: 'End To End', canArchive: true });
    expect(d.versions[0]).toMatchObject({
      semver: '1.0.0',
      isLatest: true,
      fileCount: 1,
      bytesTotal: '4096',
      analysisStatus: 'READY',
    });
    expect(d.versions[0]!.publishedAt).not.toBeNull();
    const listed = await app.call<{ items: { id: string }[] }>('GET', '/assets');
    expect(listed.items.map((a) => a.id)).toContain(id);
  });
});

describe('attachFileToVersion / removeFileFromVersion / recomputeVersionTotals', () => {
  const file = (id: string, bytes: number | string, relativePath = `${id}.png`) => ({
    id,
    relativePath,
    kind: 'TEXTURE_2D',
    bytes,
  });

  it('attaches files, keeps totals right, bumps updatedAt and emits; analysis goes back to PENDING', async () => {
    const app = await withDrafts();
    app.ctx.now = () => new Date('2026-11-11T11:11:11.500Z');
    const events = record();
    const r1 = await attachFileToVersion(app.ctx, {
      assetId: 'a-mine-pub',
      versionId: 'v-110',
      file: { ...file('f-a', 100), meta: { width: 64 } },
    });
    expect(r1).toEqual({
      id: 'f-a',
      relativePath: 'f-a.png',
      kind: 'TEXTURE_2D',
      bytes: '100',
      meta: { width: 64 },
    });
    await attachFileToVersion(app.ctx, {
      assetId: 'a-mine-pub',
      versionId: 'v-110',
      file: file('f-b', '5000000000'),
    });
    const a = await storedOrThrow(app, 'a-mine-pub');
    const v = a.versions.find((x) => x.id === 'v-110')!;
    expect(v.files.map((f) => f.id)).toEqual(['f-v-110', 'f-a', 'f-b']);
    expect(v.fileCount).toBe(3);
    expect(v.bytesTotal).toBe('5000000110'); // 10 + 100 + 5e9, beyond 32 bits
    expect(v.analysisStatus).toBe('PENDING');
    expect(a.updatedAt).toBe('2026-11-11T11:11:11.000Z');
    expect(events.filter((e) => e.type === 'assets.changed').length).toBe(2);
    // visible through the detail payload
    expect(
      (await detail(app, 'a-mine-pub')).versions.find((x) => x.id === 'v-110')!.fileCount,
    ).toBe(3);
  });

  it('is idempotent by file id (a repeated complete replaces the row)', async () => {
    const app = await withDrafts();
    await attachFileToVersion(app.ctx, {
      assetId: 'a-mine-pub',
      versionId: 'v-110',
      file: file('f-a', 100),
    });
    await attachFileToVersion(app.ctx, {
      assetId: 'a-mine-pub',
      versionId: 'v-110',
      file: file('f-a', 250),
    });
    const v = (await storedOrThrow(app, 'a-mine-pub')).versions.find((x) => x.id === 'v-110')!;
    expect(v.files.filter((f) => f.id === 'f-a')).toEqual([
      expect.objectContaining({ bytes: '250' }),
    ]);
    expect(v.bytesTotal).toBe('260');
    expect(v.fileCount).toBe(2);
  });

  it('schedules the analysis (READY after 2 s) when timers are on', async () => {
    vi.useFakeTimers();
    const app = await withDrafts({ timers: true });
    await attachFileToVersion(app.ctx, {
      assetId: 'a-mine-pub',
      versionId: 'v-110',
      file: file('f-a', 1),
    });
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    for (let i = 0; i < 60; i += 1) await Promise.resolve();
    expect(
      (await storedOrThrow(app, 'a-mine-pub')).versions.find((x) => x.id === 'v-110')!
        .analysisStatus,
    ).toBe('READY');
  });

  it("rejects unknown versions, bad input and other people's assets", async () => {
    const app = await withDrafts();
    await expect(
      attachFileToVersion(app.ctx, {
        assetId: 'a-mine-pub',
        versionId: 'v-nope',
        file: file('f', 1),
      }),
    ).rejects.toSatisfy(status(404, 'version.not_found'));
    await expect(
      attachFileToVersion(app.ctx, { assetId: 'a-nope', versionId: 'v-110', file: file('f', 1) }),
    ).rejects.toSatisfy(status(404, 'asset.not_found'));
    await expect(
      attachFileToVersion(app.ctx, {
        assetId: 'a-mine-pub',
        versionId: 'v-110',
        file: file('f', -5),
      }),
    ).rejects.toSatisfy(status(400));
    await expect(
      attachFileToVersion(app.ctx, {
        assetId: 'a-mine-pub',
        versionId: 'v-110',
        file: file('f', 'abc'),
      }),
    ).rejects.toSatisfy(status(400));
    await expect(
      attachFileToVersion(app.ctx, {
        assetId: 'a-mine-pub',
        versionId: 'v-110',
        file: file('', 1),
      }),
    ).rejects.toSatisfy(status(400));
    const non = await withDrafts({ meId: FX_OTHER, timers: false });
    await expect(
      attachFileToVersion(non.ctx, {
        assetId: 'a-mine-pub',
        versionId: 'v-110',
        file: file('f', 1),
      }),
    ).rejects.toSatisfy(status(403));
    expect(
      (await storedOrThrow(app, 'a-mine-pub')).versions.find((x) => x.id === 'v-110')!.fileCount,
    ).toBe(1);
  });

  it('removes a file and recomputes totals; unknown file is 404', async () => {
    const app = await withDrafts();
    await attachFileToVersion(app.ctx, {
      assetId: 'a-mine-pub',
      versionId: 'v-110',
      file: file('f-a', 100),
    });
    const events = record();
    await removeFileFromVersion(app.ctx, { fileId: 'f-a' });
    const v = (await storedOrThrow(app, 'a-mine-pub')).versions.find((x) => x.id === 'v-110')!;
    expect(v.files.map((f) => f.id)).toEqual(['f-v-110']);
    expect([v.fileCount, v.bytesTotal]).toEqual([1, '10']);
    expect(events).toContainEqual({ type: 'assets.changed' });
    await removeFileFromVersion(app.ctx, { fileId: 'f-v-110' });
    const empty = (await storedOrThrow(app, 'a-mine-pub')).versions.find((x) => x.id === 'v-110')!;
    expect([empty.fileCount, empty.bytesTotal, empty.files]).toEqual([0, '0', []]);
    await expect(removeFileFromVersion(app.ctx, { fileId: 'f-a' })).rejects.toSatisfy(
      status(404, 'file.not_found'),
    );
    const non = await withDrafts({ meId: FX_OTHER, timers: false });
    await expect(removeFileFromVersion(non.ctx, { fileId: 'f-v-120' })).rejects.toSatisfy(
      status(403),
    );
  });

  it('recomputeVersionTotals sums decimal strings and ignores malformed sizes', () => {
    const v = ver({ id: 'x', semver: '1.0.0' });
    v.files = [
      {
        id: '1',
        relativePath: 'a',
        kind: 'OTHER',
        bytes: '9007199254740993',
        meta: { content: '' },
      },
      { id: '2', relativePath: 'b', kind: 'OTHER', bytes: '7', meta: { content: '' } },
      { id: '3', relativePath: 'c', kind: 'OTHER', bytes: 'oops', meta: { content: '' } },
    ];
    expect(recomputeVersionTotals(v)).toBe(v);
    expect([v.bytesTotal, v.fileCount]).toEqual(['9007199254741000', 3]);
  });
});

describe('concurrent version writes', () => {
  it('create + patch + attach in parallel all land', async () => {
    const app = await withDrafts();
    const created = createVersion(app, 'a-mine-pub', { semver: '4.0.0' });
    await Promise.all([
      created,
      patchVersion(app, 'a-mine-pub', 'v-110', { releaseNotes: { en: doc('n') } }),
      setCompat(app, 'a-mine-pub', 'v-120', [{ engineVersion: '1', targets: ['WEB'] }]),
      attachFileToVersion(app.ctx, {
        assetId: 'a-mine-pub',
        versionId: 'v-110',
        file: { id: 'f-par', relativePath: 'p.png', kind: 'TEXTURE_2D', bytes: 5 },
      }),
      publishVersion(app, 'a-mine-pub', 'v-120'),
      app.call('PATCH', '/assets/a-mine-pub', { body: { title: 'Parallel' } }),
    ]);
    const a = await storedOrThrow(app, 'a-mine-pub');
    const byId = (id: string) => a.versions.find((v) => v.id === id)!;
    expect(a.versions).toHaveLength(4);
    expect(a.title).toBe('Parallel');
    expect(byId('v-110').releaseNotes).toEqual({ en: doc('n') });
    expect(byId('v-110').files.map((f) => f.id)).toContain('f-par');
    expect(byId('v-120').compatibility).toEqual([
      { engineVersion: '1', renderPipelines: [], targets: ['WEB'] },
    ]);
    expect(a.versions.filter((v) => v.isLatest).map((v) => v.id)).toEqual(['v-120']);
    expect(a.versions.some((v) => v.semver === '4.0.0')).toBe(true);
  });
});

describe('empty release-note documents', () => {
  it('an empty doc counts as no notes', async () => {
    const app = await withDrafts();
    const { id } = await createVersion(app, 'a-mine-pub', {
      semver: '6.0.0',
      releaseNotes: { en: EMPTY_DOC },
    });
    const v = (await storedOrThrow(app, 'a-mine-pub')).versions.find((x) => x.id === id)!;
    expect(v.releaseNotes).toBeNull();
  });
});

describe('publishing a new version of a published asset (the "New version" flow)', () => {
  it('create -> attach -> compatibility -> publish version: one isLatest, the new one', async () => {
    const app = await appForWrites({ timers: false });
    const before = await storedOrThrow(app, 'a-mine-pub');
    const oldLatest = before.versions.find((v) => v.isLatest)!;

    const { id: vid } = await createVersion(app, 'a-mine-pub', {
      semver: '1.1.0',
      releaseNotes: { en: doc('New things') },
    });
    // creating it leaves the old latest in place and the draft unpublished
    expect(await latestIds(app, 'a-mine-pub')).toEqual([oldLatest.id]);
    const draft = (await detail(app, 'a-mine-pub')).versions.find((v) => v.id === vid)!;
    expect(draft).toMatchObject({
      semver: '1.1.0',
      publishedAt: null,
      isLatest: false,
      fileCount: 0,
    });

    // with no file the version cannot be published
    await expect(publishVersion(app, 'a-mine-pub', vid)).rejects.toSatisfy(
      status(400, 'asset.publish_blocked'),
    );

    await attachFileToVersion(app.ctx, {
      assetId: 'a-mine-pub',
      versionId: vid,
      file: { id: 'f-nv', relativePath: 'Pack-1.1.0.unitypackage', bytes: 2048 },
    });
    await setCompat(app, 'a-mine-pub', vid, [
      { engineVersion: '2022.3', renderPipelines: ['URP'], targets: ['WINDOWS'] },
    ]);
    await publishVersion(app, 'a-mine-pub', vid);

    const a = await storedOrThrow(app, 'a-mine-pub');
    expect(a.versions.filter((v) => v.isLatest).map((v) => v.id)).toEqual([vid]);
    expect(a.versions.find((v) => v.id === oldLatest.id)!.isLatest).toBe(false);
    const nv = a.versions.find((v) => v.id === vid)!;
    expect(nv).toMatchObject({ fileCount: 1, bytesTotal: '2048' });
    expect(nv.publishedAt).not.toBeNull();
    expect(a.status).toBe('PUBLISHED');
    const d = await detail(app, 'a-mine-pub');
    expect(d.versions.find((v) => v.isLatest)!.semver).toBe('1.1.0');
  });

  it('the asset-level Update also publishes the newest draft version and flips isLatest', async () => {
    const app = await appForWrites({ timers: false });
    const { id: vid } = await createVersion(app, 'a-mine-pub', { semver: '1.1.0' });
    await attachFileToVersion(app.ctx, {
      assetId: 'a-mine-pub',
      versionId: vid,
      file: { id: 'f-nv', relativePath: 'p.zip', bytes: 1 },
    });
    await setCompat(app, 'a-mine-pub', vid, [{ engineVersion: '1', targets: ['WEB'] }]);
    await app.call('POST', '/assets/a-mine-pub/publish', { body: {} });
    expect(await latestIds(app, 'a-mine-pub')).toEqual([vid]);
  });
});
