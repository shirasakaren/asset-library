import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/brand/logo';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Link as UILink } from '@/components/ui/link';
import { GeometricPattern } from '@/components/brand/geometric-pattern';

interface PageProps {
  searchParams: Promise<{ reason?: string; error?: string }>;
}

export const metadata = { title: 'Sign-in error' };

const MESSAGES: Record<string, { titleKey: string; bodyKey: string }> = {
  'session-expired': { titleKey: 'sessionExpiredTitle', bodyKey: 'sessionExpiredBody' },
  unauthenticated: { titleKey: 'unauthenticatedTitle', bodyKey: 'unauthenticatedBody' },
  default: { titleKey: 'defaultTitle', bodyKey: 'defaultBody' },
};

export default async function AuthErrorPage({ searchParams }: PageProps) {
  const { reason, error } = await searchParams;
  const t = await getTranslations('authError');
  const key = reason ?? error ?? 'default';
  const messages = MESSAGES[key] ?? MESSAGES['default']!;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-line">
        <Container size="2xl">
          <div className="h-16 flex items-center">
            <Logo size="sm" href="/" />
          </div>
        </Container>
      </header>
      <main className="flex-1 flex items-center">
        <Container size="md">
          <div className="grid md:grid-cols-[1fr_auto] gap-10 items-center py-16">
            <div>
              <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-3">
                {t('eyebrow')}
              </p>
              <h1 className="display-lg text-ink">{t(messages.titleKey as 'defaultTitle')}</h1>
              <p className="text-body text-ink-2 mt-3 max-w-prose">
                {t(messages.bodyKey as 'defaultBody')}
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-2">
                <Button variant="primary" size="lg" asChild>
                  <a href="/auth/signin">{t('signInAgain')}</a>
                </Button>
                <Button variant="ghost" size="lg" asChild>
                  <a href="/about">{t('goToAbout')}</a>
                </Button>
              </div>
              <Alert variant="warning" className="mt-7" title={t('codeLabel')}>
                <code className="font-mono text-[12.5px] text-ink-2">{key}</code>
                {' · '}
                <UILink href="/about" variant="inline">
                  {t('learnMore')}
                </UILink>
              </Alert>
            </div>
            <div className="hidden md:block">
              <GeometricPattern variant="corner" size={64} seed={`auth-${key}`} />
            </div>
          </div>
        </Container>
      </main>
    </div>
  );
}
