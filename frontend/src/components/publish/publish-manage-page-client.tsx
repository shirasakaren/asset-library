'use client';

import NextLink from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Container } from '@/components/layout/container';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ManageActions } from '@/components/publish/manage-actions';
import { Button } from '@/components/ui/button';
import { ThumbnailImage } from '@/components/asset/thumbnail-image';
import { PageSkeleton } from '@/components/layout/page-skeleton';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { useLogQueryError } from '@/lib/hooks/use-log-query-error';
import { useMe } from '@/preview/session/me-provider';
import { formatDate, formatNumber } from '@/lib/format';
import type { AssetListPage, LocaleCode } from '@/lib/api/types';

export function PublishManagePageClient() {
  const me = useMe();
  const locale = useLocale() as LocaleCode;
  const t = useTranslations('publish.manageView');
  const fetchApi = useAuthedFetch();

  const q = useQuery({
    queryKey: queryKeys.publishManageList({ scope: 'manage', ownerId: me.id, locale }),
    queryFn: () =>
      fetchApi<AssetListPage>('/assets', {
        query: { ownerId: me.id, includeUnpublished: 'true', limit: 100, sort: 'recentlyUpdated' },
      }),
    // Own drafts change from the wizard and manage actions; always revalidate on mount.
    staleTime: 0,
  });
  // A failed list is non-fatal: the page shows zero totals and no rows.
  useLogQueryError('publish-manage.fetch-failed', '/assets', q.error);

  if (q.isPending) return <PageSkeleton size="2xl" />;

  const items = q.data?.items ?? [];

  const totals = items.reduce(
    (acc, a) => ({
      downloads: acc.downloads + a.totalDownloads,
      saves: acc.saves + a.totalSaves,
      assets: acc.assets + (a.status === 'PUBLISHED' ? 1 : 0),
    }),
    { downloads: 0, saves: 0, assets: 0 },
  );

  return (
    <Container size="2xl">
      <div className="pb-20 pt-6">
        <Breadcrumbs items={[{ label: 'Publish', href: '/publish' }, { label: t('title') }]} />
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-display-lg tracking-[-0.02em] text-ink">
              {t('title')}
            </h1>
            <p className="mt-1 text-body text-ink-2">{t('subtitle')}</p>
          </div>
          <Button asChild>
            <NextLink href="/publish/new">New asset</NextLink>
          </Button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat label={t('totalsDownloads')} value={formatNumber(totals.downloads, locale)} />
          <Stat label={t('totalsSaves')} value={formatNumber(totals.saves, locale)} />
          <Stat label={t('totalsAssets')} value={formatNumber(totals.assets, locale)} />
        </div>

        <div className="mt-8 flex flex-col gap-3">
          {items.map((a) => (
            <ManageRow key={a.id} asset={a} locale={locale} isAdmin={me.isAdmin} />
          ))}
        </div>
      </div>
    </Container>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card variant="tinted" padding="md">
      <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3">{label}</p>
      <p className="geist-tnum mt-1 font-display text-h1 tracking-[-0.015em] text-ink">{value}</p>
    </Card>
  );
}

function ManageRow({
  asset,
  locale,
  isAdmin,
}: {
  asset: AssetListPage['items'][number];
  locale: LocaleCode;
  isAdmin: boolean;
}) {
  const variant: 'success' | 'warning' | 'neutral' | 'danger' =
    asset.status === 'PUBLISHED'
      ? 'success'
      : asset.status === 'DRAFT'
        ? 'warning'
        : asset.status === 'ARCHIVED'
          ? 'neutral'
          : 'danger';
  return (
    <article className="grid grid-cols-[140px_1fr_auto] items-center gap-5 rounded-[16px] border border-line bg-surface p-3">
      <div className="aspect-[16/9] w-[140px] overflow-hidden rounded-[10px] border border-line bg-surface-muted">
        <ThumbnailImage
          src={asset.thumbnailUrl}
          alt={asset.title}
          className="!rounded-[10px]"
          unoptimized
        />
      </div>
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2">
          <Badge variant={variant}>
            {asset.status.charAt(0) + asset.status.slice(1).toLowerCase()}
          </Badge>
          <span className="geist-tnum text-caption text-ink-3">
            Updated {formatDate(asset.updatedAt, locale)}
          </span>
        </div>
        <h2 className="line-clamp-1 font-display text-h3 tracking-[-0.005em] text-ink">
          {asset.title}
        </h2>
        <p className="geist-tnum mt-1 text-caption text-ink-3">
          {formatNumber(asset.totalDownloads, locale)} downloads ·{' '}
          {formatNumber(asset.totalSaves, locale)} saves
        </p>
      </div>
      <ManageActions asset={asset} isAdmin={isAdmin} />
    </article>
  );
}
