'use client';

import NextLink from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { AssetDetailShell } from '@/components/asset/asset-detail-shell';
import { AssetDetailSkeleton } from '@/components/asset/asset-detail-skeleton';
import { Container } from '@/components/layout/container';
import { NotFoundContent } from '@/components/layout/not-found-content';
import { Button } from '@/components/ui/button';
import { useAuthedFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/queries';
import type { AssetDetail, LocaleCode } from '@/lib/api/types';
import { useDocumentTitle } from '@/lib/hooks/use-document-title';
import { useMe } from '@/preview/session/me-provider';

function AssetLoadError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('errors');
  return (
    <Container size="md">
      <div className="py-20">
        <h1 className="display-lg text-ink">{t('assetLoadTitle')}</h1>
        <p className="mt-3 max-w-prose text-body text-ink-2">{t('assetLoadBody')}</p>
        <div className="mt-7 flex flex-wrap items-center gap-2">
          <Button size="lg" onClick={onRetry}>
            {t('tryAgain')}
          </Button>
          <Button size="lg" variant="ghost" asChild>
            <NextLink href="/">{t('goToDiscover')}</NextLink>
          </Button>
        </div>
      </div>
    </Container>
  );
}

/**
 * Body of `/assets/[idOrSlug]`. Rendered by the page route for seeded slugs and
 * by the exported `not-found` shell for slugs created at runtime.
 */
export function AssetDetailPageClient({ idOrSlug }: { idOrSlug: string }) {
  const me = useMe();
  const locale = useLocale() as LocaleCode;
  const fetchApi = useAuthedFetch();
  const q = useQuery({
    queryKey: queryKeys.asset(idOrSlug, locale),
    queryFn: () =>
      fetchApi<AssetDetail>(`/assets/${encodeURIComponent(idOrSlug)}`, { query: { locale } }),
  });
  const tNotFound = useTranslations('notFound');
  const isNotFound = ApiError.isApiError(q.error) && q.error.status === 404;
  useDocumentTitle(
    isNotFound ? tNotFound('title') : (q.data?.title ?? idOrSlug.replace(/-/g, ' ')),
  );

  if (q.isPending) return <AssetDetailSkeleton />;
  if (q.error) {
    return isNotFound ? <NotFoundContent /> : <AssetLoadError onRetry={() => void q.refetch()} />;
  }
  // The asset detail carries its own isSaved flag; the recommendations module
  // hydrates its card heart state client-side via useSavedIds().
  return <AssetDetailShell asset={q.data} currentUserId={me.id} isAdmin={me.isAdmin} me={me} />;
}
