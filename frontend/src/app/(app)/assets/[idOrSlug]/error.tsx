'use client';

import { useEffect } from 'react';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { GeometricPattern } from '@/components/brand/geometric-pattern';
import { logger } from '@/lib/logger';

export default function AssetErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  useEffect(() => {
    logger.error('error.boundary', {
      message: error.message,
      digest: error.digest,
      scope: 'asset.detail',
    });
  }, [error]);

  return (
    <Container size="md">
      <div className="grid items-center gap-12 py-20 md:grid-cols-[1fr_auto]">
        <div>
          <h1 className="display-lg text-ink">{t('assetLoadTitle')}</h1>
          <p className="mt-3 max-w-prose text-body text-ink-2">{t('assetLoadBody')}</p>
          {error.digest ? (
            <Alert variant="warning" className="mt-5" title={t('requestIdLabel')}>
              <code className="font-mono text-[12.5px]">{error.digest}</code>
            </Alert>
          ) : null}
          <div className="mt-7 flex flex-wrap items-center gap-2">
            <Button size="lg" onClick={() => reset()}>
              {t('tryAgain')}
            </Button>
            <Button size="lg" variant="ghost" asChild>
              <NextLink href="/">{t('goToDiscover')}</NextLink>
            </Button>
          </div>
        </div>
        <div className="hidden md:block">
          <GeometricPattern variant="corner" size={64} seed="asset-error" />
        </div>
      </div>
    </Container>
  );
}
