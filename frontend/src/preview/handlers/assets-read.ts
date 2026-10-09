import type { AssetListPage, AssetSummary } from '@/lib/api/types';
import type { AssetRecord } from '../records';
import { route } from '../router/router';
import { notFound } from '../router/errors';
import { paginate } from '../router/paginate';
import { allowedStatuses, filterAssets, parseAssetFilters } from './filters';
import {
  findAsset,
  getMe,
  loadCatalogMaps,
  parseSort,
  reqLocale,
  sortAssets,
  toDetail,
  toSummary,
  visibleTo,
} from './helpers';
import { parseQuery, scoreAsset } from './text-search';

const RECOMMENDED_MAX = 8;

/**
 * Catalog list. Public callers get PUBLISHED assets; owners and admins can also list their
 * DRAFT/ARCHIVED ones (see `allowedStatuses`). `q` (the Search page uses it) filters by the
 * search tokenizer and orders by relevance unless an explicit `sort` is given.
 */
route('GET', '/assets', async (req, ctx): Promise<AssetListPage> => {
  const locale = reqLocale(req);
  const sort = parseSort(req.query.get('sort'));
  const filters = parseAssetFilters(req.query);
  const viewer = await getMe(ctx);
  const statuses = allowedStatuses(req.query, viewer, filters);

  const [maps, all] = await Promise.all([loadCatalogMaps(ctx), ctx.db.list<AssetRecord>('assets')]);
  let items = filterAssets(
    all.filter((a) => statuses.includes(a.status)),
    filters,
    maps,
  );

  const parsed = parseQuery(filters.q);
  if (parsed.tokens.length > 0) {
    const scores = new Map<string, number>();
    items = items.filter((a) => {
      const s = scoreAsset(a, parsed, maps);
      scores.set(a.id, s);
      return s > 0;
    });
    items = sort
      ? sortAssets(items, sort)
      : [...items].sort(
          (a, b) =>
            scores.get(b.id)! - scores.get(a.id)! ||
            b.totalDownloads - a.totalDownloads ||
            (a.id < b.id ? -1 : 1),
        );
  } else {
    items = sortAssets(items, sort ?? 'newest');
  }

  const page = paginate(items, req.query);
  return {
    items: await Promise.all(page.items.map((a) => toSummary(a, ctx, locale, maps))),
    pageInfo: page.pageInfo,
  };
});

/** Resolves the asset for `/assets/{idOrSlug}...`; a 404 when it does not exist or is not visible. */
async function resolveVisible(idOrSlug: string, ctx: Parameters<typeof getMe>[0]) {
  const [viewer, assets] = await Promise.all([getMe(ctx), ctx.db.list<AssetRecord>('assets')]);
  const asset = findAsset(assets, idOrSlug);
  if (!asset || !visibleTo(asset, viewer.id, viewer.isAdmin)) {
    throw notFound(`Asset ${idOrSlug} not found.`, { code: 'asset.not_found' });
  }
  return { asset, assets };
}

// Detail visibility does not depend on `includeUnpublished`: owners and admins always see
// their own drafts, so the flag the publish wizard sends is accepted and has no extra effect.
route('GET', '/assets/{idOrSlug}', async (req, ctx) => {
  const { asset } = await resolveVisible(req.params.idOrSlug!, ctx);
  return toDetail(asset, ctx, reqLocale(req));
});

/**
 * Up to 8 PUBLISHED assets sharing the category or a tag with the asset (never the asset
 * itself). Shared tags weigh most, then same category, then same engine; ties by downloads.
 */
route('GET', '/assets/{id}/recommended', async (req, ctx): Promise<AssetSummary[]> => {
  const locale = reqLocale(req);
  const { asset, assets } = await resolveVisible(req.params.id!, ctx);
  const mine = new Set(asset.tagIds);
  const scored = assets
    .filter((a) => a.status === 'PUBLISHED' && a.id !== asset.id)
    .map((a) => {
      const shared = a.tagIds.filter((t) => mine.has(t)).length;
      const sameCategory = a.categoryId === asset.categoryId;
      return {
        a,
        eligible: shared > 0 || sameCategory,
        score: shared * 3 + (sameCategory ? 2 : 0) + (a.engine === asset.engine ? 1 : 0),
      };
    })
    .filter((x) => x.eligible)
    .sort(
      (x, y) =>
        y.score - x.score || y.a.totalDownloads - x.a.totalDownloads || (x.a.id < y.a.id ? -1 : 1),
    )
    .slice(0, RECOMMENDED_MAX);
  const maps = await loadCatalogMaps(ctx);
  return Promise.all(scored.map((x) => toSummary(x.a, ctx, locale, maps)));
});
