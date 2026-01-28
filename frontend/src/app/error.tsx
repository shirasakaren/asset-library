'use client';

import { useEffect } from 'react';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/brand/logo';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { GeometricPattern } from '@/components/brand/geometric-pattern';
import { captureException } from '@/lib/sentry';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const t = useTranslations('errors');
  useEffect(() => {
    void captureException(error, { digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-dvh flex flex-col bg-bg">
      <header className="border-b border-line">
        <Container size="2xl">
          <div className="h-16 flex items-center">
            <Logo size="sm" href="/" />
          </div>
        </Container>
      </header>
      <main className="flex-1 flex items-center">
