'use client';

import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';

/** Inline retry view for a client page whose data failed to load (replaces the route error boundary). */
export function PageLoadError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('errors');
  return (
    <Container size="md">
      <div className="py-20">
        <h1 className="display-lg text-ink">{t('boundaryTitle')}</h1>
        <p className="mt-3 max-w-prose text-body text-ink-2">{t('boundaryBody')}</p>
        <div className="mt-7 flex flex-wrap items-center gap-2">
          <Button size="lg" onClick={onRetry}>
            {t('tryAgain')}
          </Button>
          <Button size="lg" variant="ghost" asChild>
            <NextLink href="/">{t('goHome')}</NextLink>
          </Button>
        </div>
      </div>
    </Container>
  );
}
