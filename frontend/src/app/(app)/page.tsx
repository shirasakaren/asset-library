import { getLocale } from 'next-intl/server';
import { Container } from '@/components/layout/container';
import { FeaturedCarousel } from '@/components/discover/featured-carousel';
import { QuickFilterPills } from '@/components/discover/quick-filter-pills';
import { CategoryRow } from '@/components/discover/category-row';
import { DiscoverAllGrid } from '@/components/discover/discover-all-grid';
import { requireSession, fetchMe } from '@/lib/auth/server';
import { apiFetch } from '@/lib/api/fetcher';
import type { Category, DiscoverResponse, LocaleCode } from '@/lib/api/types';
import { logger } from '@/lib/logger';

export const metadata = { title: 'Discover' };
export const revalidate = 30;

async function safeFetch<T>(path: string, accessToken: string | undefined, locale: LocaleCode): Promise<T | null> {
  try {
    return await apiFetch<T>(path, { accessToken, locale, cache: 'no-store' });
  } catch (err) {
    logger.warn('discover.fetch-failed', { path, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export default async function DiscoverPage() {
  const session = await requireSession();
  const me = await fetchMe(session);
  const locale = (await getLocale()) as LocaleCode;

  const [discover, categories] = await Promise.all([
    safeFetch<DiscoverResponse>(`/discover?locale=${locale}`, session.accessToken, locale),
    safeFetch<Category[]>(`/categories?locale=${locale}`, session.accessToken, locale),
  ]);

  // Saved (heart) state is hydrated client-side via useSavedIds() in the card
  // grids, so Discover no longer fetches the full library here.
  // Owner detection: assets whose ownerDisplayName matches the current user's display name.
  // The backend's AssetSummary doesn't carry owner.id; the asset detail does. For Discover
  // we conservatively treat nothing as owned unless the display name matches exactly.
  const ownAssetIds = new Set<string>();
  for (const row of discover?.rows ?? []) {
    for (const a of row.assets) {
      if (a.ownerDisplayName === me.displayName) ownAssetIds.add(a.id);
    }
  }

  return (
    <Container size="2xl">
      <div className="pt-8 lg:pt-10 pb-20 space-y-12">
        {discover?.featured && discover.featured.length > 0 ? (
          <FeaturedCarousel slots={discover.featured} />
        ) : null}

        {categories && categories.length > 0 ? (
          <QuickFilterPills categories={categories.slice(0, 12)} />
        ) : null}

        {discover?.rows?.map((row) => (
          <CategoryRow
            key={row.categoryId}
            categoryId={row.categoryId}
            categoryName={row.name}
            assets={row.assets}
            ownAssetIds={ownAssetIds}
          />
        ))}

        <div className="pt-4">
          <h2 className="font-display text-h1 text-ink tracking-[-0.015em] mb-5">
            All assets
          </h2>
          <DiscoverAllGrid ownAssetIds={ownAssetIds} />
        </div>
      </div>
    </Container>
  );
}
