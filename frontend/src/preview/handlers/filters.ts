import type { AssetStatus, Engine } from '@/lib/api/types';
import type { AssetRecord } from '../records';
import { badRequest } from '../router/errors';
import { listParam, type CatalogMaps, type Viewer } from './helpers';

export const ENGINES: readonly Engine[] = [
  'UNITY',
  'UNREAL',
  'BLENDER',
  'STANDALONE_3D',
  'AUDIO',
  'IMAGE',
  'VIDEO',
  'OTHER',
  'ENGINE_AGNOSTIC',
];

const STATUSES: readonly AssetStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'DELETED'];

/** Filters shared by `GET /assets`, `GET /search/assets` (and, in part, `GET /library`). */
export interface AssetFilters {
  q: string;
  categoryIds: string[];
  engines: Engine[];
  tags: string[];
  licenseIds: string[];
  licenseSlugs: string[];
  fileKinds: string[];
  renderPipelines: string[];
  targets: string[];
  ownerId: string | undefined;
}

/** Parses the shared filters. Unknown `engine` values are a 400. */
export function parseAssetFilters(query: URLSearchParams): AssetFilters {
  const engines = listParam(query, 'engine');
  for (const e of engines) {
    if (!(ENGINES as readonly string[]).includes(e)) {
      throw badRequest(`Unknown engine "${e}".`, {
        fields: [
          { path: 'engine', code: 'invalid', message: `Expected one of ${ENGINES.join(', ')}.` },
        ],
      });
    }
  }
  return {
    q: (query.get('q') ?? '').trim(),
    categoryIds: listParam(query, 'categoryIds'),
    engines: engines as Engine[],
    tags: listParam(query, 'tags'),
    licenseIds: listParam(query, 'licenseIds'),
    licenseSlugs: listParam(query, 'licenseSlug'),
    fileKinds: listParam(query, 'fileKinds'),
    renderPipelines: listParam(query, 'renderPipelines'),
    targets: listParam(query, 'targets'),
    ownerId: query.get('ownerId') || undefined,
  };
}

export function parseStatuses(query: URLSearchParams): AssetStatus[] {
  const raw = listParam(query, 'status');
  for (const s of raw) {
    if (!(STATUSES as readonly string[]).includes(s)) {
      throw badRequest(`Unknown status "${s}".`, {
        fields: [
          { path: 'status', code: 'invalid', message: `Expected one of ${STATUSES.join(', ')}.` },
        ],
      });
    }
  }
  return raw as AssetStatus[];
}

const isTruthy = (v: string | null) => v === 'true' || v === '1';

/**
 * Statuses `GET /assets` may return for this viewer.
 *
 * Everyone gets PUBLISHED. Owners (`ownerId` is the persona) and admins may also get their
 * DRAFT/ARCHIVED rows when they pass `status`, `includeUnpublished` or an `ownerId`, as the
 * publish pages do (`?ownerId=me&includeUnpublished=true`). An explicit `status` narrows
 * the set; for anyone else a non-PUBLISHED `status` simply matches nothing.
 */
export function allowedStatuses(
  query: URLSearchParams,
  viewer: Viewer,
  filters: AssetFilters,
): AssetStatus[] {
  const requested = parseStatuses(query);
  const privileged = viewer.isAdmin || filters.ownerId === viewer.id;
  const wantsMore =
    requested.length > 0 ||
    isTruthy(query.get('includeUnpublished')) ||
    filters.ownerId !== undefined;
  const pool: AssetStatus[] =
    privileged && wantsMore ? ['DRAFT', 'PUBLISHED', 'ARCHIVED'] : ['PUBLISHED'];
  return requested.length > 0 ? pool.filter((s) => requested.includes(s)) : pool;
}

const lc = (s: string) => s.toLowerCase();

/**
 * Applies the structural filters (everything except `q`, `ownerId` and status scope, which
 * the caller handles). Array filters are "any of"; ids and slugs are both accepted for
 * categories, tags and licenses.
 */
export function filterAssets(
  assets: AssetRecord[],
  f: AssetFilters,
  maps: CatalogMaps,
): AssetRecord[] {
  const catIds = new Set<string>();
  for (const c of maps.categories.values()) {
    if (f.categoryIds.includes(c.id) || f.categoryIds.map(lc).includes(lc(c.slug)))
      catIds.add(c.id);
  }
  const tagIds = new Set<string>();
  for (const t of maps.tags.values()) {
    if (f.tags.includes(t.id) || f.tags.map(lc).includes(lc(t.slug))) tagIds.add(t.id);
  }
  const licIds = new Set<string>();
  for (const l of maps.licenses.values()) {
    if (f.licenseIds.includes(l.id) || f.licenseSlugs.map(lc).includes(lc(l.slug)))
      licIds.add(l.id);
  }
  const useLicense = f.licenseIds.length > 0 || f.licenseSlugs.length > 0;

  return assets.filter((a) => {
    if (f.ownerId && a.ownerId !== f.ownerId) return false;
    if (f.categoryIds.length > 0 && !catIds.has(a.categoryId)) return false;
    if (f.engines.length > 0 && !f.engines.includes(a.engine)) return false;
    if (f.tags.length > 0 && !a.tagIds.some((id) => tagIds.has(id))) return false;
    if (useLicense && !licIds.has(a.licenseId)) return false;
    if (
      f.fileKinds.length > 0 &&
      !a.versions.some((v) => v.files.some((file) => f.fileKinds.includes(file.kind)))
    ) {
      return false;
    }
    if (f.renderPipelines.length > 0 || f.targets.length > 0) {
      const ok = a.versions.some((v) =>
        v.compatibility.some(
          (c) =>
            (f.renderPipelines.length === 0 ||
              c.renderPipelines.some((p) => f.renderPipelines.includes(p))) &&
            (f.targets.length === 0 || c.targets.some((t) => f.targets.includes(t))),
        ),
      );
      if (!ok) return false;
    }
    return true;
  });
}
