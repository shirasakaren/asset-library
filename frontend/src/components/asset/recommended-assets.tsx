'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { AssetCard } from './asset-card';
import { AssetCardSkeleton } from './asset-card-skeleton';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { useSavedIds } from '@/lib/hooks/use-saved-ids';
import type { AssetSummary, LocaleCode } from '@/lib/api/types';

interface RecommendedAssetsProps {
  assetId: string;
}

export function RecommendedAssets({ assetId }: RecommendedAssetsProps) {
  const fetcher = useAuthedFetch();
  const savedIds = useSavedIds();
  const locale = useLocale() as LocaleCode;
  const t = useTranslations('asset');
  const query = useQuery({
    queryKey: queryKeys.assetRecommended(assetId, locale),
    queryFn: () => fetcher<AssetSummary[]>(`/assets/${assetId}/recommended`, { query: { locale } }),
    staleTime: 5 * 60_000,
  });

  if (!query.isLoading && (!query.data || query.data.length === 0)) return null;

  return (
    <section className="mt-16">
      <h2 className="font-display text-h1 text-ink tracking-[-0.015em] mb-5">
        {t('recommendedTitle')}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {query.isLoading
          ? Array.from({ length: 6 }).map((_, i) => <AssetCardSkeleton key={i} />)
          : (query.data ?? []).slice(0, 6).map((asset) => (
              <AssetCard
                key={asset.id}
                variant="grid"
                asset={asset}
                isSaved={savedIds.has(asset.id)}
              />
            ))}
      </div>
    </section>
  );
}
