import { Container } from '@/components/layout/container';
import { LibraryFilters } from '@/components/library/library-filters';
import { LibraryGrid } from '@/components/library/library-grid';
import { requireSession } from '@/lib/auth/server';

export const metadata = { title: 'My Library' };
export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  await requireSession();
  return (
    <Container size="2xl">
      <div className="pt-6 pb-20 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
        <LibraryFilters />
        <LibraryGrid />
      </div>
    </Container>
  );
}
