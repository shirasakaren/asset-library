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
