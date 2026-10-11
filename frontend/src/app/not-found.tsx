'use client';

import { Suspense, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { matchDynamicRoute } from '@/preview/router/dynamic-route';
import { getDynamicPage } from '@/preview/router/dynamic-pages';
import { AppShell } from '@/components/layout/app-shell';
import { NotFoundContent } from '@/components/layout/not-found-content';
import { Logo } from '@/components/brand/logo';
import { Container } from '@/components/layout/container';
import { FooterStrip } from '@/components/brand/footer-strip';
import { useDocumentTitle } from '@/lib/hooks/use-document-title';

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

function Placeholder() {
  return <div className="min-h-dvh bg-bg" />;
}

function NotFoundPage() {
  useDocumentTitle('Page not found');
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
        <NotFoundContent />
      </main>
      <FooterStrip />
    </div>
  );
}

export default function NotFound() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  if (!hydrated) return <Placeholder />;
  const match = matchDynamicRoute(pathname);
  const Page = match ? getDynamicPage(match.route) : null;
  // A matched route without a registered page (or an unknown URL) is a real 404.
  if (!match || !Page) return <NotFoundPage />;
  return (
    <AppShell>
      <Suspense fallback={<div className="min-h-[60dvh]" />}>
        <Page params={match.params} />
      </Suspense>
    </AppShell>
  );
}
