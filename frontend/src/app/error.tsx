'use client';

import { useEffect } from 'react';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/brand/logo';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { GeometricPattern } from '@/components/brand/geometric-pattern';
import { logger } from '@/lib/logger';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const t = useTranslations('errors');
  useEffect(() => {
    logger.error('error.boundary', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="border-b border-line">
        <Container size="2xl">
          <div className="flex h-16 items-center">
            <Logo size="sm" href="/" />
          </div>
        </Container>
      </header>
      <main className="flex flex-1 items-center">
        <Container size="md">
          <div className="grid items-center gap-12 py-20 md:grid-cols-[1fr_auto]">
            <div>
              <h1 className="display-lg text-ink">{t('boundaryTitle')}</h1>
              <p className="mt-3 max-w-prose text-body text-ink-2">{t('boundaryBody')}</p>
              {error.digest ? (
                <Alert variant="warning" className="mt-6" title={t('requestIdLabel')}>
                  <code className="font-mono text-[12.5px] text-ink-2">{error.digest}</code>
                </Alert>
              ) : null}
              <div className="mt-7 flex items-center gap-2">
                <Button onClick={() => reset()} size="lg">
                  {t('tryAgain')}
                </Button>
                <Button variant="ghost" size="lg" asChild>
                  <NextLink href="/">{t('goHome')}</NextLink>
                </Button>
              </div>
            </div>
            <div className="hidden md:block">
              <GeometricPattern variant="corner" size={64} seed="error-boundary" />
            </div>
          </div>
        </Container>
      </main>
    </div>
  );
}
