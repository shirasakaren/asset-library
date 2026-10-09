import type {
  Category,
  DiscoverResponse,
  DiscoverRow,
  FeaturedSlot,
  LicenseSummary,
  Tag,
} from '@/lib/api/types';
import type {
  AssetRecord,
  CategoryRecord,
  FeaturedRecord,
  LicenseRecord,
  TagRecord,
} from '../records';
import { route } from '../router/router';
import { notFound } from '../router/errors';
import {
  intParam,
  loadCatalogMaps,
  localizedName,
  reqLocale,
  sortAssets,
  toSummary,
} from './helpers';
import { rankTags } from './text-search';

const FEATURED_LIMIT = 5;
const ROW_SIZE = 12;

const bySortOrder = <T extends { sortOrder: number; id: string }>(a: T, b: T) =>
  a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1);

route('GET', '/categories', async (req, ctx) => {
  const locale = reqLocale(req);
  const [categories, assets] = await Promise.all([
    ctx.db.list<CategoryRecord>('categories'),
    ctx.db.list<AssetRecord>('assets'),
  ]);
  const counts = new Map<string, number>();
  for (const a of assets) {
    if (a.status === 'PUBLISHED') counts.set(a.categoryId, (counts.get(a.categoryId) ?? 0) + 1);
  }
  return categories
    .filter((c) => c.isActive)
    .sort(bySortOrder)
    .map((c): Category => ({
      id: c.id,
      slug: c.slug,
      name: localizedName(c.name, locale),
      iconKey: c.iconKey,
      sortOrder: c.sortOrder,
      assetCount: counts.get(c.id) ?? 0,
    }));
});

/** `Tag[]`, `q` is a name/slug prefix, most used first. */
route('GET', '/tags', async (req, ctx) => {
  const limit = intParam(req.query, 'limit', { def: 50, min: 1, max: 200 });
  const tags = await ctx.db.list<TagRecord>('tags');
  return rankTags(tags, req.query.get('q') ?? '', 'prefix')
    .slice(0, limit)
    .map((t): Tag => ({
      id: t.id,
      slug: t.slug,
      displayName: t.displayName,
      usageCount: t.usageCount,
    }));
});

route('GET', '/licenses', async (req, ctx) => {
  const locale = reqLocale(req);
  const licenses = await ctx.db.list<LicenseRecord>('licenses');
  return licenses
    .filter((l) => l.isActive)
    .sort(bySortOrder)
    .map((l): LicenseSummary => ({
      id: l.id,
      slug: l.slug,
      name: l.name,
      description: localizedName(l.description, locale),
      sortOrder: l.sortOrder,
    }));
});

/** Accepts the license id or slug. Includes `fullText` (what the publish wizard shows). */
route('GET', '/licenses/{id}', async (req, ctx) => {
  const locale = reqLocale(req);
  const key = req.params.id!;
  const licenses = await ctx.db.list<LicenseRecord>('licenses');
  const l = licenses.find((x) => x.id === key) ?? licenses.find((x) => x.slug === key);
  if (!l) throw notFound(`License ${key} not found.`, { code: 'license.not_found' });
  return {
    id: l.id,
    slug: l.slug,
    name: l.name,
    description: localizedName(l.description, locale),
    fullText: localizedName(l.fullText, locale),
    sortOrder: l.sortOrder,
  };
});

route('GET', '/discover', async (req, ctx): Promise<DiscoverResponse> => {
  const locale = reqLocale(req);
  const [maps, assets, slots] = await Promise.all([
    loadCatalogMaps(ctx),
    ctx.db.list<AssetRecord>('assets'),
    ctx.db.list<FeaturedRecord>('featured'),
  ]);
  const published = assets.filter((a) => a.status === 'PUBLISHED');
  const byId = new Map(published.map((a) => [a.id, a]));

  const featured: FeaturedSlot[] = [];
  for (const slot of slots.filter((s) => s.isActive).sort(bySortOrder)) {
    const a = byId.get(slot.assetId);
    if (!a) continue;
    featured.push({
      id: slot.id,
      assetId: a.id,
      assetSlug: a.slug,
      title: slot.customTitle ?? (localizedName(a.titleI18n, locale) || a.title),
      shortDescription:
        slot.customShortDescription?.[locale] ||
        localizedName(a.shortDescriptionI18n, locale) ||
        a.shortDescription,
      bannerUrl: slot.customBannerUrl ?? a.thumbnail?.url ?? null,
      sortOrder: slot.sortOrder,
    });
    if (featured.length === FEATURED_LIMIT) break;
  }

  const rows: DiscoverRow[] = [];
  const categories = [...maps.categories.values()].filter((c) => c.isActive).sort(bySortOrder);
  for (const c of categories) {
    const top = sortAssets(
      published.filter((a) => a.categoryId === c.id),
      'newest',
    ).slice(0, ROW_SIZE);
    if (top.length === 0) continue;
    rows.push({
      categoryId: c.id,
      categorySlug: c.slug,
      name: localizedName(c.name, locale),
      assets: await Promise.all(top.map((a) => toSummary(a, ctx, locale, maps))),
    });
  }
  return { featured, rows };
});
