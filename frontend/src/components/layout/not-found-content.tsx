'use client';

import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { GeometricPattern } from '@/components/brand/geometric-pattern';

/** The 404 message block (no page chrome), shared by the root 404 and in-page "asset not found". */
export function NotFoundContent() {
  const t = useTranslations('notFound');
  return (
    <Container size="md">
      <div className="grid items-center gap-12 py-20 md:grid-cols-[1fr_auto]">
        <div>
          <p className="geist-tnum mb-3 text-eyebrow uppercase tracking-[0.12em] text-ink-3">
            {t('eyebrow')}
          </p>
          <h1 className="display-xl text-ink">{t('title')}</h1>
          <p className="mt-4 max-w-prose text-body-lg text-ink-2">{t('body')}</p>
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <Button size="lg" asChild>
              <NextLink href="/">{t('goHome')}</NextLink>
            </Button>
            <Button size="lg" variant="ghost" asChild>
              <NextLink href="/search">{t('searchAssets')}</NextLink>
            </Button>
          </div>
        </div>
        <div className="hidden md:block">
          <div className="overflow-hidden rounded-[20px] border border-line">
            <GeometricPattern variant="corner" size={72} seed="404" />
          </div>
        </div>
      </div>
    </Container>
  );
}
