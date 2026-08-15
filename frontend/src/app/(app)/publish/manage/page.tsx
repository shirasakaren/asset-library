import NextLink from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Container } from '@/components/layout/container';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ManageActions } from '@/components/publish/manage-actions';
import { Button } from '@/components/ui/button';
import { ThumbnailImage } from '@/components/asset/thumbnail-image';
import { requireSession, fetchMe } from '@/lib/auth/server';
import { apiFetch } from '@/lib/api/fetcher';
import { formatDate, formatNumber } from '@/lib/format';
import type { AssetListPage, LocaleCode } from '@/lib/api/types';

export const metadata = { title: 'Manage' };
export const dynamic = 'force-dynamic';

export default async function ManagePage() {
  const session = await requireSession();
  const me = await fetchMe(session);
  const locale = (await getLocale()) as LocaleCode;
  const t = await getTranslations('publish.manageView');

  let items: AssetListPage['items'] = [];
  try {
    const res = await apiFetch<AssetListPage>('/assets', {
      accessToken: session.accessToken,
      locale,
      cache: 'no-store',
      query: { ownerId: me.id, includeUnpublished: 'true', limit: 100, sort: 'recentlyUpdated' },
    });
    items = res.items;
  } catch {
    /* non-fatal */
  }

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
      <div className="pt-6 pb-20">
        <Breadcrumbs items={[{ label: 'Publish', href: '/publish' }, { label: t('title') }]} />
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-display-lg text-ink tracking-[-0.02em]">{t('title')}</h1>
            <p className="mt-1 text-body text-ink-2">{t('subtitle')}</p>
          </div>
          <Button asChild>
            <NextLink href="/publish/new">New asset</NextLink>
          </Button>
        </div>

        <div className="mt-6 grid sm:grid-cols-3 gap-3">
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
      <p className="mt-1 font-display text-h1 text-ink geist-tnum tracking-[-0.015em]">{value}</p>
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
    <article className="grid grid-cols-[140px_1fr_auto] gap-5 items-center p-3 rounded-[16px] border border-line bg-surface">
      <div className="aspect-[16/9] w-[140px] rounded-[10px] overflow-hidden border border-line bg-surface-muted">
        <ThumbnailImage src={asset.thumbnailUrl} alt={asset.title} className="!rounded-[10px]" unoptimized />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant={variant}>{asset.status.charAt(0) + asset.status.slice(1).toLowerCase()}</Badge>
          <span className="text-caption text-ink-3 geist-tnum">
            Updated {formatDate(asset.updatedAt, locale)}
          </span>
        </div>
        <h2 className="font-display text-h3 text-ink tracking-[-0.005em] line-clamp-1">{asset.title}</h2>
        <p className="text-caption text-ink-3 mt-1 geist-tnum">
          {formatNumber(asset.totalDownloads, locale)} downloads · {formatNumber(asset.totalSaves, locale)} saves
        </p>
      </div>
      <ManageActions asset={asset} isAdmin={isAdmin} />
    </article>
  );
}
