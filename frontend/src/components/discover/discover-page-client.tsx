'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { Container } from '@/components/layout/container';
import { AssetCardSkeleton } from '@/components/asset/asset-card-skeleton';
import { FeaturedCarousel } from '@/components/discover/featured-carousel';
import { QuickFilterPills } from '@/components/discover/quick-filter-pills';
import { CategoryRow } from '@/components/discover/category-row';
import { DiscoverAllGrid } from '@/components/discover/discover-all-grid';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys, STALE_TIMES } from '@/lib/api/queries';
import type { Category, DiscoverResponse, LocaleCode } from '@/lib/api/types';
import { logger } from '@/lib/logger';
import { useMe } from '@/preview/session/me-provider';

function DiscoverSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-12">
      <AssetCardSkeleton variant="feature" />
      {[0, 1].map((i) => (
        <div key={i} className="flex gap-4 overflow-hidden">
          {[0, 1, 2, 3, 4].map((j) => (
            <AssetCardSkeleton key={j} variant="compact" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Body of the Discover home page (`/`). */
export function DiscoverPageClient() {
  const me = useMe();
  const locale = useLocale() as LocaleCode;
  const fetchApi = useAuthedFetch();

  const discoverQ = useQuery({
    queryKey: queryKeys.discover(locale),
    queryFn: () => fetchApi<DiscoverResponse>('/discover', { query: { locale } }),
    staleTime: STALE_TIMES.discover,
  });
  const categoriesQ = useQuery({
    queryKey: queryKeys.categories(locale),
    queryFn: () => fetchApi<Category[]>('/categories', { query: { locale } }),
    staleTime: STALE_TIMES.categories,
  });

  useEffect(() => {
    if (discoverQ.error) {
      logger.warn('discover.fetch-failed', { path: '/discover', err: discoverQ.error.message });
    }
  }, [discoverQ.error]);
  useEffect(() => {
    if (categoriesQ.error) {
      logger.warn('discover.fetch-failed', { path: '/categories', err: categoriesQ.error.message });
    }
  }, [categoriesQ.error]);

  // A failed feed leaves the sections out and still shows the "All assets" grid,
  // as the page did when it swallowed fetch errors on the server.
  const discover = discoverQ.data ?? null;
  const categories = categoriesQ.data ?? null;

  // Owner detection: assets whose ownerDisplayName matches the current user's display name.
  // The backend's AssetSummary doesn't carry owner.id; the asset detail does. For Discover
  // we conservatively treat nothing as owned unless the display name matches exactly.
  const ownAssetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of discover?.rows ?? []) {
      for (const a of row.assets) {
        if (a.ownerDisplayName === me.displayName) ids.add(a.id);
      }
    }
    return ids;
  }, [discover, me.displayName]);

  return (
    <Container size="2xl">
      <div className="space-y-12 pb-20 pt-8 lg:pt-10">
        {discoverQ.isPending || categoriesQ.isPending ? (
          <DiscoverSkeleton />
        ) : (
          <>
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
          </>
        )}

        <div className="pt-4">
          <h2 className="mb-5 font-display text-h1 tracking-[-0.015em] text-ink">All assets</h2>
          <DiscoverAllGrid ownAssetIds={ownAssetIds} />
        </div>
      </div>
    </Container>
  );
}
