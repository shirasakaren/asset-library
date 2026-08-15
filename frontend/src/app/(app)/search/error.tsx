'use client';

import { useEffect } from 'react';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { captureException } from '@/lib/sentry';

export default function SearchErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  useEffect(() => {
    void captureException(error, { digest: error.digest, scope: 'search' });
  }, [error]);
  return (
    <Container size="lg">
      <div className="py-20">
        <h1 className="display-lg text-ink">{t('boundaryTitle')}</h1>
        <p className="mt-3 text-body text-ink-2">{t('boundaryBody')}</p>
        {error.digest ? (
          <Alert variant="warning" className="mt-5" title={t('requestIdLabel')}>
            <code className="font-mono text-[12.5px]">{error.digest}</code>
          </Alert>
        ) : null}
        <div className="mt-6 flex items-center gap-2">
          <Button onClick={() => reset()}>{t('tryAgain')}</Button>
          <Button variant="ghost" asChild>
            <NextLink href="/">{t('goHome')}</NextLink>
          </Button>
        </div>
      </div>
    </Container>
  );
}
