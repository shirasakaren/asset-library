import NextLink from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/brand/logo';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { GeometricPattern } from '@/components/brand/geometric-pattern';
import { FooterStrip } from '@/components/brand/footer-strip';

export const metadata = { title: 'Not found' };

export default async function NotFound() {
  const t = await getTranslations('notFound');
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
        <Container size="md">
          <div className="grid md:grid-cols-[1fr_auto] gap-12 items-center py-20">
            <div>
              <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-3 geist-tnum">
                {t('eyebrow')}
              </p>
              <h1 className="display-xl text-ink">{t('title')}</h1>
              <p className="text-body-lg text-ink-2 mt-4 max-w-prose">{t('body')}</p>
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
