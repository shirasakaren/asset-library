'use client';

import { useSyncExternalStore } from 'react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { matchDynamicRoute } from '@/preview/router/dynamic-route';
import { Logo } from '@/components/brand/logo';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { GeometricPattern } from '@/components/brand/geometric-pattern';
import { FooterStrip } from '@/components/brand/footer-strip';

const noopSubscribe = () => () => {};

/**
 * False while rendering on the server / during hydration, true afterwards.
 * The exported 404.html is prerendered for "/_not-found", but is served for
 * ANY unknown URL, so the first client render must not depend on the real
 * pathname (otherwise React throws hydration error #418).
 */
function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export default function NotFound() {
  const t = useTranslations('notFound');
  const pathname = usePathname();
  const hydrated = useHydrated();
  if (!hydrated) return <div className="min-h-dvh bg-bg" />;
  const match = matchDynamicRoute(pathname);
  // TODO(task-5): render the client page registered for `match.route` with `match.params`.
  if (match) return null;
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
                  <a href="/search">{t('searchAssets')}</a>
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
      </main>
      <FooterStrip />
    </div>
  );
}
