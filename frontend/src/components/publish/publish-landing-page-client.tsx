'use client';

import NextLink from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { AssetCard } from '@/components/asset/asset-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GeometricPattern } from '@/components/brand/geometric-pattern';
import { PageSkeleton } from '@/components/layout/page-skeleton';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { useLogQueryError } from '@/lib/hooks/use-log-query-error';
import { useMe } from '@/preview/session/me-provider';
import { publicEnv } from '@/lib/env.public';
import type { AssetListPage, LocaleCode } from '@/lib/api/types';

export function PublishLandingPageClient() {
  const me = useMe();
  const locale = useLocale() as LocaleCode;
  const t = useTranslations('publish');
  const fetchApi = useAuthedFetch();

  // Both drafts and published listed via /assets?ownerId=… with includeUnpublished.
  const q = useQuery({
    queryKey: queryKeys.publishManageList({ scope: 'landing', ownerId: me.id, locale }),
    queryFn: () =>
      fetchApi<AssetListPage>('/assets', {
        query: { ownerId: me.id, includeUnpublished: 'true', limit: 50 },
      }),
    // Own drafts change from the wizard and manage actions; always revalidate on mount.
    staleTime: 0,
  });
  // A failed list is non-fatal: the page shows the empty state.
  useLogQueryError('publish.fetch-failed', '/assets', q.error);

  if (q.isPending) return <PageSkeleton size="2xl" />;

  const items = q.data?.items ?? [];
  const drafts = items.filter((a) => a.status === 'DRAFT');
  const published = items.filter((a) => a.status === 'PUBLISHED');

  const hasAnything = drafts.length + published.length > 0;

  if (!hasAnything) {
    return (
      <Container size="lg">
        <div className="grid items-center gap-12 py-20 md:grid-cols-[1fr_auto]">
          <div>
            <h1 className="display-xl text-ink">{t('empty.title')}</h1>
            <p className="mt-3 max-w-prose text-body-lg text-ink-2">{t('empty.body')}</p>
            <div className="mt-7 flex flex-wrap items-center gap-2">
              <Button asChild size="lg">
                <NextLink href="/publish/new">{t('newAsset')}</NextLink>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <a
                  href={publicEnv.NEXT_PUBLIC_COMMUNITY_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('readGuide')}
                </a>
              </Button>
            </div>
          </div>
          <div className="hidden md:block">
            <GeometricPattern variant="corner" size={64} seed="publish-empty" />
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container size="2xl">
      <div className="pb-20 pt-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-display-lg tracking-[-0.02em] text-ink">
              {t('title')}
            </h1>
            <p className="mt-1 text-body text-ink-2">{t('subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <NextLink href="/publish/manage">{t('manage')}</NextLink>
            </Button>
            <Button asChild>
              <NextLink href="/publish/new">{t('newAsset')}</NextLink>
            </Button>
          </div>
        </div>

        {drafts.length > 0 ? (
          <section className="mb-12">
            <h2 className="mb-4 inline-flex items-center gap-3 font-display text-h1 tracking-[-0.015em] text-ink">
              {t('draftsHeading')}
              <Badge variant="warning">{drafts.length}</Badge>
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {drafts.map((asset) => (
                <DraftCard key={asset.id} asset={asset} />
              ))}
            </div>
          </section>
        ) : null}

        {published.length > 0 ? (
          <section>
            <h2 className="mb-4 inline-flex items-center gap-3 font-display text-h1 tracking-[-0.015em] text-ink">
              {t('publishedHeading')}
              <Badge variant="success">{published.length}</Badge>
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {published.map((asset) => (
                <AssetCard
                  key={asset.id}
                  variant="grid"
                  asset={asset}
                  isOwner
                  href={`/publish/${asset.id}`}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </Container>
  );
}

function DraftCard({ asset }: { asset: AssetListPage['items'][number] }) {
  return (
    <Card variant="outlined" padding="md" className="flex flex-col">
      <div className="relative aspect-[16/9] overflow-hidden rounded-[14px] border border-line bg-surface-muted">
        {asset.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.thumbnailUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-caption uppercase tracking-[0.12em] text-ink-3">
            No thumbnail
          </div>
        )}
      </div>
      <div className="mt-3 flex items-start justify-between gap-2">
        <h3 className="line-clamp-1 font-display text-h3 tracking-[-0.005em] text-ink">
          {asset.title || 'Untitled'}
        </h3>
        <Badge variant="warning">Draft</Badge>
      </div>
      <p className="mt-1 text-caption text-ink-3">
        Updated {new Date(asset.updatedAt).toLocaleDateString()}
      </p>
      <div className="mt-auto flex items-center gap-2 pt-3">
        <Button asChild size="sm" variant="secondary" fullWidth>
          <NextLink href={`/publish/${asset.id}`}>Continue editing</NextLink>
        </Button>
      </div>
    </Card>
  );
}
