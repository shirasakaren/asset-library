import {
  createTestApp,
  fixtureAsset,
  fixtureCatalog,
  fixtureUsers,
  FX_OTHER,
  FX_PERSONA,
  type TestApp,
} from '@/preview/test-utils';
import { ApiError } from '@/lib/api/errors';
import type { CollectionName, Doc } from '@/preview/types';
import type {
  AnalyticsRecord,
  AssetFileRecord,
  AssetRecord,
  AuditRecord,
  KvRecord,
  StorageRecord,
  UserRecord,
} from '@/preview/records';

export { FX_OTHER, FX_PERSONA };

/** `expect(promise).rejects.toSatisfy(status(403, 'auth.forbidden'))`. */
export const status = (s: number, code?: string) => (e: unknown) =>
  ApiError.isApiError(e) && e.status === s && (code === undefined || e.code === code);

/** Fixture seed anchor, and the day the clock stands on unless a test moves it. */
export const ANCHOR = '2026-06-01T00:00:00.000Z';
/** Last day of the fixture platform series and of the storage snapshot (anchor - 1 day). */
export const SEED_END = '2026-05-31';
/** A clock on which the fixture seed is "fresh": the day after the seed series end (the anchor day). */
export const REBASED_TODAY = '2026-06-01T12:00:00.000Z';
export const NOW = '2026-06-10T12:00:00.000Z';

/** Platform downloads: 90 values, value = index (so the last 30 are 60..89, sum 2235). */
export const PLATFORM_DOWNLOADS = Array.from({ length: 90 }, (_, i) => i);
export const PLATFORM_LAST30 = PLATFORM_DOWNLOADS.slice(-30).reduce((a, b) => a + b, 0);

export const BUCKETS = { source: 6000, derived: 500, thumbs: 200, featured: 50, editor: 25 };

const flat = (bytes: number) => new Array<number>(30).fill(bytes);
/** 100, 200, ... 3000. */
const ramp = Array.from({ length: 30 }, (_, i) => 100 * (i + 1));

export const fixtureStorage = (): StorageRecord[] => [
  {
    id: 'st-asset-a-fx-001',
    kind: 'asset',
    refId: 'a-fx-001',
    bytes: 3000,
    spark: ramp,
    asOfDate: SEED_END,
  },
  {
    id: 'st-asset-a-fx-002',
    kind: 'asset',
    refId: 'a-fx-002',
    bytes: 2000,
    spark: flat(2000),
    asOfDate: SEED_END,
  },
  {
    id: 'st-asset-a-fx-003',
    kind: 'asset',
    refId: 'a-fx-003',
    bytes: 1000,
    spark: flat(1000),
    asOfDate: SEED_END,
  },
  {
    id: 'st-user-u-other',
    kind: 'user',
    refId: FX_OTHER,
    bytes: 6000,
    spark: ramp.map((v) => v + 3000),
    asOfDate: SEED_END,
  },
  ...(Object.entries(BUCKETS) as Array<[keyof typeof BUCKETS, number]>).map(
    ([bucket, bytes]): StorageRecord => ({
      id: `st-bucket-${bucket}`,
      kind: 'bucket',
      bucket,
      bytes,
      asOfDate: SEED_END,
    }),
  ),
];

export const fixtureAnalytics = (): AnalyticsRecord[] => [
  { id: 'an-platform', kind: 'platform', endDate: SEED_END, downloads: PLATFORM_DOWNLOADS },
  {
    id: 'an-a-fx-001',
    kind: 'asset',
    assetId: 'a-fx-001',
    endDate: SEED_END,
    downloads7d: 50,
    downloads30d: 120,
    detail: null,
  },
  {
    id: 'an-a-fx-002',
    kind: 'asset',
    assetId: 'a-fx-002',
    endDate: SEED_END,
    downloads7d: 70,
    downloads30d: 90,
    detail: null,
  },
  {
    id: 'an-a-fx-003',
    kind: 'asset',
    assetId: 'a-fx-003',
    endDate: SEED_END,
    downloads7d: 0,
    downloads30d: 5,
    detail: null,
  },
];

export const fixtureMeta = (): KvRecord[] => [
  {
    id: 'meta',
    value: { personaId: FX_PERSONA, anchor: ANCHOR, seedVersion: 'test', assetCount: 3 },
  },
];

/** `n` audit rows, `au-001` oldest ... `au-NNN` newest, one minute apart ending 2026-05-31T23:00Z. */
export function fixtureAudit(n: number): AuditRecord[] {
  const end = Date.parse('2026-05-31T23:00:00.000Z');
  return Array.from({ length: n }, (_, i) => ({
    id: `au-${String(i + 1).padStart(3, '0')}`,
    action: i % 2 === 0 ? 'asset.admin_edit' : 'tag.update',
    subjectType: i % 2 === 0 ? 'Asset' : 'Tag',
    subjectId: i % 2 === 0 ? 'a-fx-001' : 'tag-lava',
    actorId: i % 5 === 4 ? null : i % 2 === 0 ? FX_PERSONA : FX_OTHER,
    metadata: i % 3 === 0 ? { reason: `r${i}` } : null,
    createdAt: new Date(end - (n - 1 - i) * 60_000).toISOString(),
  }));
}

/** A file the visitor uploaded (not a seeded `.txt` link file). */
export const uploadedFile = (id: string, bytes: number): AssetFileRecord =>
  ({
    id,
    relativePath: `${id}.zip`,
    kind: 'ARCHIVE',
    bytes: String(bytes),
    meta: { upload: { blobId: `blob-${id}`, contentType: 'application/zip', stored: true } },
  }) as unknown as AssetFileRecord;

export const withUploadedFile = (asset: AssetRecord, file: AssetFileRecord): AssetRecord => {
  const versions = asset.versions.map((v, i) =>
    i === asset.versions.length - 1
      ? { ...v, files: [...v.files, file], fileCount: v.files.length + 1 }
      : v,
  );
  return { ...asset, versions };
};

/** Extra users: another admin (u-admin2) and a plain user, on top of the fixture three. */
export const moreUsers = (): UserRecord[] => [
  ...fixtureUsers(),
  {
    id: 'u-admin2',
    email: 'admin2@example.test',
    displayName: 'Second Admin',
    role: 'admin',
    avatar: { initials: 'SA', bgColor: 'brand-blue', fgColor: 'ink-white' },
    createdAt: '2025-09-01T00:00:00.000Z',
    locale: 'en',
    isAdmin: true,
  },
];

export interface AdminAppOpts {
  meId?: string;
  /** ISO instant the clock stands on (default `NOW`). */
  now?: string;
  /** Fixture assets are `a-fx-001..003` (published, owned by `u-other`) plus these. */
  assets?: AssetRecord[];
}

/**
 * Fixture app for the admin handlers: the 3-asset catalog (users persona = admin, u-other,
 * u-third), `kv.meta`, a 90-day platform series, per-asset analytics, storage rollups and
 * 12 audit rows. `extra` replaces whole collections; the clock is fixed to `opts.now`.
 */
export async function adminApp(
  opts: AdminAppOpts = {},
  extra: Partial<Record<CollectionName, Doc[]>> = {},
): Promise<TestApp> {
  const base = fixtureCatalog(3);
  const app = await createTestApp(
    {
      ...base,
      kv: fixtureMeta(),
      analytics: fixtureAnalytics(),
      storage: fixtureStorage(),
      audit: fixtureAudit(12),
      ...extra,
      assets: [
        ...((extra.assets as AssetRecord[] | undefined) ?? base.assets ?? []),
        ...(opts.assets ?? []),
      ],
    },
    { timers: false, meId: opts.meId },
  );
  const at = new Date(opts.now ?? NOW);
  app.ctx.now = () => new Date(at);
  return app;
}

/** A PUBLISHED fixture asset of `u-other`, published at `publishedAt`. */
export const published = (id: string, publishedAt: string, over: Partial<AssetRecord> = {}) =>
  fixtureAsset(id, { publishedAt, createdAt: publishedAt, updatedAt: publishedAt, ...over });

/** `db.patch` of an asset (typed). */
export const patchAsset = (app: TestApp, id: string, partial: Partial<AssetRecord>) =>
  app.db.patch<AssetRecord>('assets', id, partial);

/**
 * Admin asset fixture world on top of `adminApp`: the 3 published assets of `u-other`
 * (`a-fx-001` 3d-models, `-002` 2d-art, `-003` 3d-models + tag-lowpoly), plus
 * `a-mine` (PUBLISHED, persona, tag-lava), `a-arch` (ARCHIVED, u-other), `a-draft` (DRAFT,
 * u-third) and `a-gone` (DELETED, u-third, tag-lava). `updatedAt` descends in that order.
 */
export async function assetsApp(
  opts: Omit<AdminAppOpts, 'assets'> = {},
  extra: Partial<Record<CollectionName, Doc[]>> = {},
): Promise<TestApp> {
  const t = (day: number) => `2026-05-${String(day).padStart(2, '0')}T10:00:00.000Z`;
  return adminApp(
    {
      ...opts,
      assets: [
        fixtureAsset('a-mine', {
          ownerId: FX_PERSONA,
          slug: 'mine',
          title: 'My Own Asset',
          tagIds: ['tag-lava'],
          createdAt: '2026-04-01T00:00:00.000Z',
          publishedAt: '2026-04-01T00:00:00.000Z',
          updatedAt: t(10),
          totalDownloads: 9,
          totalSaves: 5,
        }),
        fixtureAsset('a-arch', {
          status: 'ARCHIVED',
          title: 'Archived Alpha',
          publishedAt: '2026-04-02T00:00:00.000Z',
          updatedAt: t(9),
        }),
        fixtureAsset('a-draft', {
          status: 'DRAFT',
          ownerId: 'u-third',
          title: 'Draft Zeta',
          updatedAt: t(8),
        }),
        fixtureAsset('a-gone', {
          status: 'DELETED',
          ownerId: 'u-third',
          title: 'Gone Beta',
          publishedAt: null,
          tagIds: ['tag-lava'],
          updatedAt: t(7),
        }),
      ],
    },
    extra,
  );
}

const FIXTURE_AUDIT_IDS = new Set(fixtureAudit(12).map((r) => r.id));

/** Audit rows written during the test (everything but the 12 fixture rows, by id). */
export const newAudits = async (app: TestApp): Promise<AuditRecord[]> =>
  (await app.db.list<AuditRecord>('audit')).filter((r) => !FIXTURE_AUDIT_IDS.has(r.id));
