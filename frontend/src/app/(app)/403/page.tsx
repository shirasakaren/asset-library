import { Logo } from '@/components/brand/logo';
import { Container } from '@/components/layout/container';
import { ForbiddenContent } from '@/components/layout/forbidden-content';

export const metadata = { title: 'Forbidden' };

export default function ForbiddenPage() {
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
        <ForbiddenContent />
      </main>
    </div>
  );
}
