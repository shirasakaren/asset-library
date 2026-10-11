import NextLink from 'next/link';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { GeometricPattern } from '@/components/brand/geometric-pattern';

/** The 403 message block (no page chrome), shared by `/403` and the admin gate for non-admins. */
export function ForbiddenContent() {
  return (
    <Container size="md">
      <div className="grid items-center gap-12 py-20 md:grid-cols-[1fr_auto]">
        <div>
          <p className="geist-tnum mb-3 text-eyebrow uppercase tracking-[0.12em] text-ink-3">403</p>
          <h1 className="display-xl text-ink">You don't have access to that page.</h1>
          <p className="mt-4 max-w-prose text-body-lg text-ink-2">
            That route is reserved for admins. If you think this is a mistake, contact a workspace
            admin.
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
  );
}
