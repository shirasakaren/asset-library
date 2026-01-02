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
