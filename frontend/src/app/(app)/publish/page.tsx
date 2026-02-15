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
