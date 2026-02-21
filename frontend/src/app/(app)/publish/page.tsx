import NextLink from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { AssetCard } from '@/components/asset/asset-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GeometricPattern } from '@/components/brand/geometric-pattern';
import { requireSession, fetchMe } from '@/lib/auth/server';
import { apiFetch } from '@/lib/api/fetcher';
import { publicEnv } from '@/lib/env.public';
import type { AssetListPage, LocaleCode } from '@/lib/api/types';

export const metadata = { title: 'Publish' };
export const dynamic = 'force-dynamic';

export default async function PublishLandingPage() {
  const session = await requireSession();
  const me = await fetchMe(session);
  const locale = (await getLocale()) as LocaleCode;
  const t = await getTranslations('publish');

  // Both drafts and published listed via /assets?ownerId=… with includeUnpublished.
  let drafts: AssetListPage['items'] = [];
  let published: AssetListPage['items'] = [];
  try {
    const all = await apiFetch<AssetListPage>('/assets', {
      accessToken: session.accessToken,
      locale,
      cache: 'no-store',
      query: { ownerId: me.id, includeUnpublished: 'true', limit: 50 },
    });
    drafts = all.items.filter((a) => a.status === 'DRAFT');
    published = all.items.filter((a) => a.status === 'PUBLISHED');
  } catch {
    /* non-fatal */
  }

  const hasAnything = drafts.length + published.length > 0;

  if (!hasAnything) {
    return (
      <Container size="lg">
        <div className="py-20 grid md:grid-cols-[1fr_auto] gap-12 items-center">
          <div>
            <h1 className="display-xl text-ink">{t('empty.title')}</h1>
            <p className="mt-3 text-body-lg text-ink-2 max-w-prose">{t('empty.body')}</p>
            <div className="mt-7 flex flex-wrap items-center gap-2">
              <Button asChild size="lg">
                <NextLink href="/publish/new">{t('newAsset')}</NextLink>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <a href={publicEnv.NEXT_PUBLIC_COMMUNITY_DOCS_URL} target="_blank" rel="noopener noreferrer">
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
      <div className="pt-8 pb-20">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-8">
          <div>
            <h1 className="font-display text-display-lg text-ink tracking-[-0.02em]">{t('title')}</h1>
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
            <h2 className="font-display text-h1 text-ink tracking-[-0.015em] mb-4 inline-flex items-center gap-3">
              {t('draftsHeading')}
              <Badge variant="warning">{drafts.length}</Badge>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {drafts.map((asset) => (
                <DraftCard key={asset.id} asset={asset} />
              ))}
            </div>
          </section>
        ) : null}

        {published.length > 0 ? (
          <section>
            <h2 className="font-display text-h1 text-ink tracking-[-0.015em] mb-4 inline-flex items-center gap-3">
              {t('publishedHeading')}
              <Badge variant="success">{published.length}</Badge>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {published.map((asset) => (
                <AssetCard key={asset.id} variant="grid" asset={asset} isOwner href={`/publish/${asset.id}`} />
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
      <div className="aspect-[16/9] rounded-[14px] overflow-hidden bg-surface-muted relative border border-line">
        {asset.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-ink-3 text-caption uppercase tracking-[0.12em]">
            No thumbnail
          </div>
        )}
      </div>
      <div className="mt-3 flex items-start justify-between gap-2">
        <h3 className="font-display text-h3 text-ink tracking-[-0.005em] line-clamp-1">
          {asset.title || 'Untitled'}
        </h3>
        <Badge variant="warning">Draft</Badge>
      </div>
      <p className="text-caption text-ink-3 mt-1">Updated {new Date(asset.updatedAt).toLocaleDateString()}</p>
      <div className="mt-auto pt-3 flex items-center gap-2">
        <Button asChild size="sm" variant="secondary" fullWidth>
          <NextLink href={`/publish/${asset.id}`}>Continue editing</NextLink>
        </Button>
      </div>
    </Card>
  );
}
