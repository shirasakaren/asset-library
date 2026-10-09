'use client';

import { Suspense } from 'react';
import { Container } from '@/components/layout/container';
import { LibraryFilters } from '@/components/library/library-filters';
import { LibraryGrid } from '@/components/library/library-grid';
import { AssetCardSkeleton } from '@/components/asset/asset-card-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

function LibraryFallback() {
  return (
    <>
      <Skeleton className="h-72 w-full !rounded-[16px]" />
      <div role="status" aria-label="Loading" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <AssetCardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}

/**
 * Body of `/library`. Filters live in the URL, so both children read
 * `useSearchParams()`, which static export requires to sit under `<Suspense>`.
 */
export function LibraryPageClient() {
  return (
    <Container size="2xl">
      <div className="grid grid-cols-1 gap-8 pb-20 pt-6 lg:grid-cols-[280px_1fr]">
        <Suspense fallback={<LibraryFallback />}>
          <LibraryFilters />
          <LibraryGrid />
        </Suspense>
      </div>
    </Container>
  );
}
