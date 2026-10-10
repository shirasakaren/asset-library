import type {
  AssetDetail,
  AssetSummary,
  AssetVersionPayload,
  LocaleCode,
  ReleaseNotes,
  SortOrder,
  TipTapDoc,
} from '@/lib/api/types';
import type {
  AssetRecord,
  AssetVersionRecord,
  CategoryRecord,
  I18n,
  LibraryRecord,
  LicenseRecord,
  TagRecord,
  UserRecord,
} from '../records';
import type { PreviewContext, PreviewRequest } from '../router/router';
import { badRequest } from '../router/errors';

/* -------------------------------------------------------------------------- *
 * Locale
 * -------------------------------------------------------------------------- */

export const isLocale = (v: unknown): v is LocaleCode => v === 'en' || v === 'id';

/** `?locale=` wins over the request locale (the UI passes both). */
export function reqLocale(req: Pick<PreviewRequest, 'query' | 'locale'>): LocaleCode {
  const q = req.query.get('locale');
  return isLocale(q) ? q : isLocale(req.locale) ? req.locale : 'en';
}

/** `i18n[locale]`, falling back to English when the entry is missing or empty. */
export function localizedName(i18n: Partial<I18n> | undefined | null, locale: LocaleCode): string {
  return i18n?.[locale] || i18n?.en || '';
}

/* -------------------------------------------------------------------------- *
 * Viewer
 * -------------------------------------------------------------------------- */

export interface Viewer {
  id: string;
  isAdmin: boolean;
  /** The persona's stored user record (absent only in sparse test fixtures). */
  user: UserRecord | undefined;
}

/** The persona (`ctx.meId`) and whether they are an admin. */
export async function getMe(ctx: PreviewContext): Promise<Viewer> {
  const user = await ctx.db.get<UserRecord>('users', ctx.meId);
  return { id: ctx.meId, isAdmin: user?.isAdmin === true, user };
}

/* -------------------------------------------------------------------------- *
 * Lookup maps (one load per request)
 * -------------------------------------------------------------------------- */

export interface CatalogMaps {
  categories: Map<string, CategoryRecord>;
  users: Map<string, UserRecord>;
  tags: Map<string, TagRecord>;
  licenses: Map<string, LicenseRecord>;
  /** Asset ids in the persona's library (any `hidden` state). */
  saved: Set<string>;
}

const byId = <T extends { id: string }>(rows: T[]): Map<string, T> =>
  new Map(rows.map((r) => [r.id, r]));

/**
 * Loads the small reference collections once so a handler can map many assets
 * without one `db` round-trip (and clone) per asset. Pass the result as the
 * optional last argument of `toSummary` / `toDetail`.
 */
export async function loadCatalogMaps(ctx: PreviewContext): Promise<CatalogMaps> {
  const [categories, users, tags, licenses, library] = await Promise.all([
    ctx.db.list<CategoryRecord>('categories'),
    ctx.db.list<UserRecord>('users'),
    ctx.db.list<TagRecord>('tags'),
    ctx.db.list<LicenseRecord>('licenses'),
    ctx.db.list<LibraryRecord>('library'),
  ]);
  return {
    categories: byId(categories),
    users: byId(users),
    tags: byId(tags),
    licenses: byId(licenses),
    saved: new Set(library.map((l) => l.id)),
  };
}

/* -------------------------------------------------------------------------- *
 * Visibility and sorting
 * -------------------------------------------------------------------------- */

/**
 * Whether the viewer may open an asset: DELETED is never visible, PUBLISHED is
 * visible to everyone, DRAFT/ARCHIVED only to the owner and admins.
 */
export function visibleTo(a: AssetRecord, meId: string, isAdmin: boolean): boolean {
  if (a.status === 'DELETED') return false;
  if (a.status === 'PUBLISHED') return true;
  return isAdmin || a.ownerId === meId;
}

export const SORT_ORDERS: readonly SortOrder[] = [
  'newest',
  'mostDownloaded',
  'recentlyUpdated',
  'alphabetical',
  'mostSaved',
];

/** Validates a `sort` query value; `null`/'' means "not given". Unknown values are a 400. */
export function parseSort(raw: string | null | undefined): SortOrder | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  if ((SORT_ORDERS as readonly string[]).includes(raw)) return raw as SortOrder;
  throw badRequest(`Unknown sort "${raw}". Expected one of ${SORT_ORDERS.join(', ')}.`);
}

const cmp = <T extends string | number>(a: T, b: T): number => (a < b ? -1 : a > b ? 1 : 0);
/** Descending ISO timestamps; nulls last. */
const cmpDateDesc = (a: string | null, b: string | null): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return cmp(b, a);
};

/** Sort comparators; every one ends in an `id` tiebreak so the order is total. */
const COMPARATORS: Record<SortOrder, (a: AssetRecord, b: AssetRecord) => number> = {
  newest: (a, b) =>
    cmpDateDesc(a.publishedAt, b.publishedAt) || cmpDateDesc(a.createdAt, b.createdAt),
  mostDownloaded: (a, b) => b.totalDownloads - a.totalDownloads,
  mostSaved: (a, b) => b.totalSaves - a.totalSaves,
  recentlyUpdated: (a, b) => cmpDateDesc(a.updatedAt, b.updatedAt),
  alphabetical: (a, b) =>
    cmp(a.title.toLowerCase(), b.title.toLowerCase()) || cmp(a.title, b.title),
};

/** New array in the requested order (total order, `id` ascending as the last tiebreak). */
export function sortAssets(items: AssetRecord[], sort: SortOrder): AssetRecord[] {
  const compare = COMPARATORS[sort];
  return [...items].sort((a, b) => compare(a, b) || cmp(a.id, b.id));
}

/* -------------------------------------------------------------------------- *
 * Query-string helpers
 * -------------------------------------------------------------------------- */

/** All values of a possibly repeated and/or comma-separated param (`a=1&a=2` or `a=1,2`). */
export function listParam(query: URLSearchParams, name: string): string[] {
  const out: string[] = [];
  for (const raw of query.getAll(name)) {
    for (const part of raw.split(',')) {
      const v = part.trim();
      if (v) out.push(v);
    }
  }
  return out;
}

/** Integer query param. Missing => `def`; malformed or below `min` => 400; above `max` => clamped. */
export function intParam(
  query: URLSearchParams,
  name: string,
  opts: { def: number; min: number; max: number },
): number {
  const raw = query.get(name);
  if (raw === null || raw === '') return opts.def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < opts.min) {
    throw badRequest(`"${name}" must be an integer >= ${opts.min}.`);
  }
  return Math.min(n, opts.max);
}

/* -------------------------------------------------------------------------- *
 * Mapping records to API payloads
 * -------------------------------------------------------------------------- */

const MISSING_USER = 'Unknown user';

export function latestVersion(a: AssetRecord): AssetVersionRecord | undefined {
  return a.versions.find((v) => v.isLatest) ?? a.versions[a.versions.length - 1];
}

/** `AssetSummary` for cards and lists. Pass `maps` when mapping many assets. */
export async function toSummary(
  a: AssetRecord,
  ctx: PreviewContext,
  locale: LocaleCode,
  maps?: CatalogMaps,
): Promise<AssetSummary> {
  const m = maps ?? (await loadCatalogMaps(ctx));
  return {
    id: a.id,
    slug: a.slug,
    title: localizedName(a.titleI18n, locale) || a.title,
    shortDescription: localizedName(a.shortDescriptionI18n, locale) || a.shortDescription,
    engine: a.engine,
    status: a.status,
    thumbnailUrl: a.thumbnail?.url ?? a.thumbnailAutoGenerated?.url ?? null,
    ownerDisplayName: m.users.get(a.ownerId)?.displayName ?? MISSING_USER,
    categoryName: localizedName(m.categories.get(a.categoryId)?.name, locale),
    totalDownloads: a.totalDownloads,
    // Stored counter: already includes the persona's own save (see records.ts).
    totalSaves: a.totalSaves,
    updatedAt: a.updatedAt,
    publishedAt: a.publishedAt,
  };
}

/** Numeric semver comparator, newest first. */
function compareSemverDesc(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const isDoc = (v: unknown): v is TipTapDoc =>
  typeof v === 'object' && v !== null && (v as { type?: unknown }).type === 'doc';

/**
 * Release notes as the API returns them: `{ en?, id? }`. A bare TipTap document (what the seed
 * stored before it used locale maps, and so possibly data in an older overlay) is wrapped as
 * `{ en: doc }`; anything unusable is `null`. Use it wherever stored notes leave the handlers
 * (asset detail, download options).
 */
export function normalizeReleaseNotes(raw: unknown): ReleaseNotes | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  if (isDoc(raw)) return { en: raw };
  const out: ReleaseNotes = {};
  for (const l of ['en', 'id'] as const) {
    const v = (raw as Record<string, unknown>)[l];
    if (isDoc(v)) out[l] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Strips the stored-only fields (`createdAt`, `avStatus`, `avAcknowledgedAt`). */
function toVersionPayload(v: AssetVersionRecord): AssetVersionPayload {
  const { createdAt: _c, avStatus: _s, avAcknowledgedAt: _a, ...payload } = v;
  void _c;
  void _s;
  void _a;
  return { ...payload, releaseNotes: normalizeReleaseNotes(v.releaseNotes) };
}

/** Full `AssetDetail`. Pass `maps` when mapping many assets. */
export async function toDetail(
  a: AssetRecord,
  ctx: PreviewContext,
  locale: LocaleCode,
  maps?: CatalogMaps,
): Promise<AssetDetail> {
  const m = maps ?? (await loadCatalogMaps(ctx));
  const me = await getMe(ctx);
  const category = m.categories.get(a.categoryId);
  const license = m.licenses.get(a.licenseId);
  const owner = m.users.get(a.ownerId);
  const canEdit = me.isAdmin || a.ownerId === me.id;
  const versions = [...a.versions]
    .sort((x, y) => compareSemverDesc(x.semver, y.semver) || cmp(x.id, y.id))
    .map(toVersionPayload);

  return {
    id: a.id,
    slug: a.slug,
    title: localizedName(a.titleI18n, locale) || a.title,
    shortDescription: localizedName(a.shortDescriptionI18n, locale) || a.shortDescription,
    longDescription: a.longDescription,
    availableLocales: a.availableLocales,
    engine: a.engine,
    category: {
      id: a.categoryId,
      slug: category?.slug ?? '',
      name: localizedName(category?.name, locale),
    },
    license: {
      id: a.licenseId,
      slug: license?.slug ?? '',
      name: license?.name ?? '',
    },
    tags: a.tagIds.flatMap((id) => {
      const t = m.tags.get(id);
      return t ? [{ id: t.id, slug: t.slug, displayName: t.displayName }] : [];
    }),
    thumbnail: a.thumbnail ?? { key: null, url: null },
    thumbnailAutoGenerated: a.thumbnailAutoGenerated ?? null,
    // The detail gallery already leads with `thumbnail`; the seed also lists the cover as a
    // preview item, which would show twice.
    previewMedia: a.previewMedia.filter(
      (pm) => !(a.thumbnail?.url && (pm.viewUrl === a.thumbnail.url || pm.key === a.thumbnail.key)),
    ),
    owner: {
      id: a.ownerId,
      displayName: owner?.displayName ?? MISSING_USER,
      avatar: owner?.avatar ?? { initials: '?', bgColor: 'brand-blue', fgColor: 'ink-white' },
    },
    versions,
    totalDownloads: a.totalDownloads,
    totalSaves: a.totalSaves,
    status: a.status,
    publishedAt: a.publishedAt,
    updatedAt: a.updatedAt,
    createdAt: a.createdAt,
    isSaved: m.saved.has(a.id),
    canEdit,
    canDelete: canEdit,
    canArchive: canEdit && a.status === 'PUBLISHED',
    // Runtime-created assets store ''; leave the fields off instead of sending empty strings.
    ...(a.storeName && a.storeUrl ? { storeName: a.storeName, storeUrl: a.storeUrl } : {}),
  };
}

/** Finds a non-deleted asset by id or slug (id wins when both could match). */
export function findAsset(assets: AssetRecord[], idOrSlug: string): AssetRecord | undefined {
  return (
    assets.find((a) => a.id === idOrSlug && a.status !== 'DELETED') ??
    assets.find((a) => a.slug === idOrSlug && a.status !== 'DELETED')
  );
}
