import NextLink from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Card } from '@/components/ui/card';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
// Recharts is lazy-loaded (client-only) via this wrapper so it never ships in
// shared chunks. SSR-off is fine: the page is `force-dynamic` and owner-gated.
import { AnalyticsCharts } from '@/components/publish/analytics-charts.lazy';
import { requireSession, fetchMe } from '@/lib/auth/server';
import { apiFetch } from '@/lib/api/fetcher';
import type { AssetAnalyticsDetail, LocaleCode } from '@/lib/api/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AnalyticsPage({ params }: PageProps) {
  const { id } = await params;
  const session = await requireSession();
  await fetchMe(session); // ensures session
  const locale = (await getLocale()) as LocaleCode;
  const t = await getTranslations('publish.analytics');

  let data: AssetAnalyticsDetail | null = null;
  try {
    data = await apiFetch<AssetAnalyticsDetail>(`/me/analytics/assets/${id}`, {
      accessToken: session.accessToken,
      locale,
      cache: 'no-store',
    });
  } catch {
    /* non-fatal — the page renders empty states */
  }

  return (
    <Container size="2xl">
      <div className="pt-6 pb-20">
        <Breadcrumbs
          items={[
            { label: 'Publish', href: '/publish' },
            { label: 'Manage', href: '/publish/manage' },
            { label: t('title') },
          ]}
        />
        <div className="mt-3 flex items-center gap-3">
          <h1 className="font-display text-display-lg text-ink tracking-[-0.02em]">{t('title')}</h1>
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
