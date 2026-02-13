import { Container } from '@/components/layout/container';
import { SearchFilterSidebar } from '@/components/filters/search-filter-sidebar';
import { SearchResults } from '@/components/search/search-results';
import { requireSession } from '@/lib/auth/server';

export const metadata = { title: 'Search' };
export const revalidate = 30;

export default async function SearchPage() {
  await requireSession();

  // Saved (heart) state is hydrated client-side via useSavedIds() in
  // SearchResults — no server-side /library fetch needed here.
  return (
    <Container size="2xl">
      <div className="pt-6 pb-20 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
        <SearchFilterSidebar />
        <SearchResults />
      </div>
    </Container>
  );
}
