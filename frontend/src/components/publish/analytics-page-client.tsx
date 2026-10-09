'use client';

import NextLink from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Container } from '@/components/layout/container';
import { PageSkeleton } from '@/components/layout/page-skeleton';
// Recharts is lazy-loaded (client-only) via this wrapper so it never ships in shared chunks.
import { AnalyticsCharts } from '@/components/publish/analytics-charts.lazy';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Card } from '@/components/ui/card';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import type { AssetAnalyticsDetail } from '@/lib/api/types';
import { useLogQueryError } from '@/lib/hooks/use-log-query-error';

/** Body of `/publish/manage/[id]/analytics`. */
export function AnalyticsPageClient({ id }: { id: string }) {
  const t = useTranslations('publish.analytics');
  const fetchApi = useAuthedFetch();
  const q = useQuery({
    queryKey: queryKeys.myAnalyticsAsset(id),
    queryFn: () => fetchApi<AssetAnalyticsDetail>(`/me/analytics/assets/${encodeURIComponent(id)}`),
  });
  // A failed load is non-fatal: the page renders its empty state.
  useLogQueryError('analytics.fetch-failed', '/me/analytics/assets', q.error);

  if (q.isPending) return <PageSkeleton size="2xl" />;
  const data = q.data ?? null;

  return (
    <Container size="2xl">
      <div className="pb-20 pt-6">
        <Breadcrumbs
          items={[
            { label: 'Publish', href: '/publish' },
            { label: 'Manage', href: '/publish/manage' },
            { label: t('title') },
          ]}
        />
        <div className="mt-3 flex items-center gap-3">
          <h1 className="font-display text-display-lg tracking-[-0.02em] text-ink">{t('title')}</h1>
          <NextLink
            href="/publish/manage"
            className="inline-flex items-center gap-1 text-caption text-brand-blue hover:underline"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={2.25} />
            {t('back')}
          </NextLink>
        </div>

        {!data ? (
          <Card variant="tinted" padding="lg" className="mt-8">
            <p className="text-body-sm text-ink-3">No analytics data available yet.</p>
          </Card>
        ) : (
          <AnalyticsCharts data={data} />
        )}
      </div>
    </Container>
  );
}
