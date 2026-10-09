import type { HiddenFilter, LibraryItem, LibraryPage, LibrarySort } from '@/lib/api/types';
import type { AssetRecord, LibraryRecord } from '../records';
import { route, type PreviewContext } from '../router/router';
import { badRequest, notFound } from '../router/errors';
import { paginate } from '../router/paginate';
import { filterAssets, parseAssetFilters } from './filters';
import { loadCatalogMaps, reqLocale, toSummary } from './helpers';
import { matchesTitleOrTags, parseQuery } from './text-search';

const LIBRARY_SORTS: readonly LibrarySort[] = ['savedAt', 'alphabetical', 'recentlyUpdated'];
const HIDDEN_FILTERS: readonly HiddenFilter[] = ['true', 'false', 'all'];

const assetNotFound = (id: string) =>
  notFound(`Asset ${id} not found.`, { code: 'asset.not_found' });

// Library writes are read-modify-write over two collections (the library row and the asset's
// `totalSaves`), so serialize them: a double click must not count twice.
let writeChain: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => undefined);
  return next;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

route('GET', '/library', async (req, ctx): Promise<LibraryPage> => {
  const locale = reqLocale(req);
  const sort = (req.query.get('sort') || 'savedAt') as LibrarySort;
  if (!LIBRARY_SORTS.includes(sort)) {
    throw badRequest(`Unknown sort "${sort}". Expected one of ${LIBRARY_SORTS.join(', ')}.`);
  }
  const hidden = (req.query.get('hidden') || 'false') as HiddenFilter;
  if (!HIDDEN_FILTERS.includes(hidden)) {
    throw badRequest(`Unknown hidden filter "${hidden}". Expected true, false or all.`);
  }
  const filters = parseAssetFilters(req.query);

  const [maps, assets, records] = await Promise.all([
    loadCatalogMaps(ctx),
    ctx.db.list<AssetRecord>('assets'),
    ctx.db.list<LibraryRecord>('library'),
  ]);
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const parsed = parseQuery(filters.q);

  // Only PUBLISHED assets are listed (an archived or deleted save is kept but not shown).
  let rows = records
    .filter((r) => hidden === 'all' || r.hidden === (hidden === 'true'))
    .flatMap((r) => {
      const asset = assetById.get(r.id);
      return asset && asset.status === 'PUBLISHED' ? [{ id: r.id, record: r, asset }] : [];
    });
  const allowed = new Set(
    filterAssets(
      rows.map((r) => r.asset),
      filters,
      maps,
    ).map((a) => a.id),
  );
  rows = rows.filter((r) => allowed.has(r.id));
  if (parsed.tokens.length > 0)
    rows = rows.filter((r) => matchesTitleOrTags(r.asset, parsed, maps));

  const order: Record<LibrarySort, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> =
    {
      savedAt: (a, b) => cmp(b.record.addedAt, a.record.addedAt),
      alphabetical: (a, b) => cmp(a.asset.title.toLowerCase(), b.asset.title.toLowerCase()),
      recentlyUpdated: (a, b) => cmp(b.asset.updatedAt, a.asset.updatedAt),
    };
  rows.sort((a, b) => order[sort](a, b) || cmp(a.id, b.id));

  const page = paginate(rows, req.query);
  const items: LibraryItem[] = await Promise.all(
    page.items.map(async (r) => ({
      addedAt: r.record.addedAt,
      hidden: r.record.hidden,
      asset: await toSummary(r.asset, ctx, locale, maps),
    })),
  );
  return { items, pageInfo: page.pageInfo };
});

const changed = (ctx: PreviewContext) => ctx.emit({ type: 'assets.changed' });

route('POST', '/library/items', (req, ctx) =>
  serialized(async () => {
    const body = req.body as { assetId?: unknown } | null | undefined;
    const assetId = body && typeof body === 'object' ? body.assetId : undefined;
    if (typeof assetId !== 'string' || !assetId) {
      throw badRequest('assetId is required.', {
        fields: [
          { path: 'assetId', code: 'required', message: 'assetId must be a non-empty string.' },
        ],
      });
    }
    const asset = await ctx.db.get<AssetRecord>('assets', assetId);
    if (!asset || asset.status !== 'PUBLISHED') throw assetNotFound(assetId);

    const existing = await ctx.db.get<LibraryRecord>('library', assetId);
    if (!existing) {
      await ctx.db.put<LibraryRecord>('library', {
        id: assetId,
        addedAt: ctx.now().toISOString(),
        hidden: false,
      });
      await ctx.db.patch<AssetRecord>('assets', assetId, { totalSaves: asset.totalSaves + 1 });
    } else if (existing.hidden) {
      // Saving again brings a hidden item back; the original addedAt is kept.
      await ctx.db.patch<LibraryRecord>('library', assetId, { hidden: false });
    }
    changed(ctx);
    return undefined;
  }),
);

route('DELETE', '/library/items/{assetId}', (req, ctx) =>
  serialized(async () => {
    const assetId = req.params.assetId!;
    const existing = await ctx.db.get<LibraryRecord>('library', assetId);
    if (existing) {
      await ctx.db.remove('library', assetId);
      const asset = await ctx.db.get<AssetRecord>('assets', assetId);
      if (asset) {
        await ctx.db.patch<AssetRecord>('assets', assetId, {
          totalSaves: Math.max(0, asset.totalSaves - 1),
        });
      }
    }
    changed(ctx);
    return undefined;
  }),
);

route('PATCH', '/library/items/{assetId}', (req, ctx) =>
  serialized(async () => {
    const assetId = req.params.assetId!;
    const body = req.body as { hidden?: unknown } | null | undefined;
    const hidden = body && typeof body === 'object' ? body.hidden : undefined;
    if (typeof hidden !== 'boolean') {
      throw badRequest('hidden must be a boolean.', {
        fields: [{ path: 'hidden', code: 'invalid', message: 'hidden must be true or false.' }],
      });
    }
    const existing = await ctx.db.get<LibraryRecord>('library', assetId);
    if (!existing) throw notFound('Item not in library.', { code: 'asset.not_found' });
    await ctx.db.patch<LibraryRecord>('library', assetId, { hidden });
    changed(ctx);
    return undefined;
  }),
);
