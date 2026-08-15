import NextLink from 'next/link';
import { Logo } from '@/components/brand/logo';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { GeometricPattern } from '@/components/brand/geometric-pattern';

export const metadata = { title: 'Forbidden' };

export default function ForbiddenPage() {
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
                403
              </p>
              <h1 className="display-xl text-ink">You don't have access to that page.</h1>
              <p className="text-body-lg text-ink-2 mt-4 max-w-prose">
                That route is reserved for admins. If you think this is a mistake, contact a
                workspace admin.
              </p>
              <div className="mt-7 flex items-center gap-2">
                <Button size="lg" asChild>
                  <NextLink href="/">Go to Discover</NextLink>
                </Button>
              </div>
            </div>
            <div className="hidden md:block">
              <GeometricPattern variant="corner" size={64} seed="403" />
            </div>
          </div>
        </Container>
      </main>
    </div>
  );
}
