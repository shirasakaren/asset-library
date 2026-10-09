import type { CollectionName, Db, Doc, SeedSource } from './types';
import { createDb } from './store/db';
import { createSeedSource } from './store/seed-source';
import { dispatch, type PreviewContext, type PreviewRequest } from './router/router';
import { createContext } from './router/context';
import { toSearchParams } from './router/query';
import type { AssetRecord, CategoryRecord, LicenseRecord, TagRecord, UserRecord } from './records';
import './handlers';

// Test-only helpers: never import this module from app code (the seeded app pulls in the
// whole seed JSON, and fixtures are for unit tests).

export interface TestApp {
  call<T = unknown>(
    method: string,
    path: string,
    opts?: { query?: Record<string, unknown>; body?: unknown; locale?: 'en' | 'id' },
  ): Promise<T>;
  db: Db;
  ctx: PreviewContext;
}

async function buildApp(
  source: SeedSource,
  opts: { meId?: string; timers?: boolean },
): Promise<TestApp> {
  // overlay: null => in-memory only, so `db.persistent === false` in tests.
  const db = await createDb({ seed: source, overlay: null, seedVersion: 'test' });
  const ctx = createContext(db, { meId: opts.meId, timers: opts.timers ?? true });
  return {
    db,
    ctx,
    async call<T>(
      method: string,
      path: string,
      o: { query?: Record<string, unknown>; body?: unknown; locale?: 'en' | 'id' } = {},
    ) {
      const result = await dispatch(
        {
          method: method.toUpperCase() as PreviewRequest['method'],
          path,
          query: toSearchParams(o.query),
          body: o.body,
          locale: o.locale ?? 'en',
        },
        ctx,
      );
      return (result === undefined ? undefined : structuredClone(result)) as T;
    },
  };
}

export async function createTestApp(
  seed: Partial<Record<CollectionName, Doc[]>> = {},
  opts: { meId?: string; timers?: boolean } = {},
): Promise<TestApp> {
  const source: SeedSource = { load: async (coll) => seed[coll] ?? [] };
  return buildApp(source, opts);
}

/** An app over the REAL committed seed JSON (`src/preview/seed-data/*.json`), in-memory overlay. */
export async function createSeededTestApp(
  opts: { meId?: string; timers?: boolean } = {},
): Promise<TestApp> {
  return buildApp(createSeedSource(), opts);
}

/* -------------------------------------------------------------------------- *
 * Small catalog fixtures for edge-case unit tests.
 * -------------------------------------------------------------------------- */

export const FX_PERSONA = 'u-persona';
export const FX_OTHER = 'u-other';

export const fixtureUsers = (): UserRecord[] => [
  {
    id: FX_PERSONA,
    email: 'aria@example.test',
    displayName: 'Aria Wijaya',
    role: 'admin',
    avatar: { initials: 'AW', bgColor: 'brand-blue', fgColor: 'ink-white' },
    createdAt: '2025-06-12T00:00:00.000Z',
    locale: 'en',
    isAdmin: true,
  },
  {
    id: FX_OTHER,
    email: 'kenji@example.test',
    displayName: 'Kenji Matsuda',
    role: 'contributor',
    avatar: { initials: 'KM', bgColor: 'brand-green', fgColor: 'ink-white' },
    createdAt: '2025-07-01T00:00:00.000Z',
    locale: 'en',
    isAdmin: false,
  },
  {
    id: 'u-third',
    email: 'siti@example.test',
    displayName: 'Siti Rahmawati',
    role: 'user',
    avatar: { initials: 'SR', bgColor: 'brand-red', fgColor: 'ink-white' },
    createdAt: '2025-08-01T00:00:00.000Z',
    locale: 'id',
    isAdmin: false,
  },
];

export const fixtureCategories = (): CategoryRecord[] => [
  {
    id: 'cat-3d-models',
    slug: '3d-models',
    name: { en: '3D Models', id: 'Model 3D' },
    iconKey: 'box',
    sortOrder: 10,
    isActive: true,
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
  },
  {
    id: 'cat-2d-art',
    slug: '2d-art',
    name: { en: '2D Art & Sprites', id: 'Seni 2D & Sprite' },
    iconKey: 'image',
    sortOrder: 20,
    isActive: true,
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
  },
  {
    id: 'cat-empty',
    slug: 'empty',
    name: { en: 'Empty Category', id: 'Kategori Kosong' },
    iconKey: null,
    sortOrder: 30,
    isActive: true,
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
  },
];

export const fixtureLicenses = (): LicenseRecord[] => [
  {
    id: 'lic-mit',
    slug: 'mit',
    name: 'MIT License',
    description: { en: 'Permissive license.', id: 'Lisensi permisif.' },
    fullText: { en: 'MIT full text', id: '' },
    sortOrder: 10,
    isActive: true,
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
  },
  {
    id: 'lic-cc0',
    slug: 'cc0',
    name: 'CC0 1.0 Universal',
    description: { en: 'Public domain.', id: 'Domain publik.' },
    fullText: { en: 'CC0 full text', id: 'Teks lengkap CC0' },
    sortOrder: 20,
    isActive: true,
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
  },
];

export const fixtureTags = (): TagRecord[] => [
  {
    id: 'tag-lowpoly',
    slug: 'lowpoly',
    displayName: 'Low Poly',
    usageCount: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-lava',
    slug: 'lava',
    displayName: 'Lava',
    usageCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-pixel',
    slug: 'pixel',
    displayName: 'Pixel',
    usageCount: 9,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-unused',
    slug: 'unused',
    displayName: 'Unused Tag',
    usageCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

/** One valid `AssetRecord`; override anything. */
export function fixtureAsset(
  id: string,
  over: Partial<AssetRecord> & { slug?: string } = {},
): AssetRecord {
  const slug = over.slug ?? id.replace(/^a-/, '');
  const title = over.title ?? `Fixture ${slug}`;
  const short = over.shortDescription ?? `Short text for ${slug}.`;
  const created = over.createdAt ?? '2026-02-01T00:00:00.000Z';
  const status = over.status ?? 'PUBLISHED';
  const published = status === 'DRAFT' ? null : (over.publishedAt ?? created);
  const base: AssetRecord = {
    id,
    slug,
    title,
    shortDescription: short,
    longDescription: null,
    availableLocales: ['en', 'id'],
    engine: 'UNITY',
    thumbnail: { key: `thumbs/${slug}.webp`, url: `/thumbs/${slug}.webp` },
    thumbnailAutoGenerated: null,
    previewMedia: [],
    totalDownloads: 0,
    totalSaves: 0,
    status,
    publishedAt: published,
    updatedAt: created,
    createdAt: created,
    ownerId: FX_OTHER,
    categoryId: 'cat-3d-models',
    licenseId: 'lic-mit',
    tagIds: [],
    titleI18n: { en: title, id: title },
    shortDescriptionI18n: { en: short, id: `Teks singkat untuk ${slug}.` },
    thumbnailSmall: `/thumbs/${slug}-sm.webp`,
    storeName: 'Test Store',
    storeUrl: 'https://store.example.test/x',
    viewCount: 0,
    versions: [
      {
        id: `v-${slug}-1-0-0`,
        semver: '1.0.0',
        releaseNotes: null,
        publishedAt: published,
        isLatest: true,
        analysisStatus: 'READY',
        bytesTotal: '10',
        fileCount: 1,
        files: [
          {
            id: `f-${slug}-1-0-0`,
            relativePath: `${slug}-1.0.0.txt`,
            kind: 'OTHER',
            bytes: '10',
            meta: { content: 'x' },
          },
        ],
        compatibility: [
          { engineVersion: '2022.3', renderPipelines: ['URP'], targets: ['WINDOWS'] },
        ],
        dependencies: [],
        requiresEmptyProject: false,
        createdAt: created,
        avStatus: 'CLEAN',
        avAcknowledgedAt: null,
      },
    ],
  };
  return { ...base, ...over, id, slug, title };
}

/**
 * `n` PUBLISHED assets (`a-fx-001` ...) alternating between `cat-3d-models` (odd index 1,3,..)
 * and `cat-2d-art` (even), plus users, categories (one empty), licenses and tags.
 * Known values: asset `i` is published `i` days after 2026-01-01 (so `a-fx-n` is newest),
 * `totalDownloads = (i * 7) % 5` (lots of ties), `totalSaves = i % 4`, title `Fixture Item NNN`.
 * Returns seed data for `createTestApp`, so callers can spread extra assets into `assets`.
 */
export function fixtureCatalog(n: number): Partial<Record<CollectionName, Doc[]>> {
  const assets: AssetRecord[] = [];
  for (let i = 1; i <= n; i += 1) {
    const num = String(i).padStart(3, '0');
    const day = new Date(Date.UTC(2026, 0, 1 + i)).toISOString();
    assets.push(
      fixtureAsset(`a-fx-${num}`, {
        slug: `fx-${num}`,
        title: `Fixture Item ${num}`,
        categoryId: i % 2 === 1 ? 'cat-3d-models' : 'cat-2d-art',
        publishedAt: day,
        createdAt: day,
        updatedAt: day,
        totalDownloads: (i * 7) % 5,
        totalSaves: i % 4,
        licenseId: i % 2 === 1 ? 'lic-mit' : 'lic-cc0',
        tagIds: i % 3 === 0 ? ['tag-lowpoly'] : [],
      }),
    );
  }
  return {
    users: fixtureUsers(),
    categories: fixtureCategories(),
    licenses: fixtureLicenses(),
    tags: fixtureTags(),
    assets,
  };
}
