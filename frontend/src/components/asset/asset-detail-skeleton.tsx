import { Container } from '@/components/layout/container';
import { Skeleton } from '@/components/ui/skeleton';

/** Pending UI for the asset detail page; mirrors the shell's header + gallery + sidebar layout. */
export function AssetDetailSkeleton() {
  return (
    <Container size="2xl">
      <div role="status" aria-label="Loading" className="pb-20 pt-6">
        <Skeleton className="h-4 w-48" />
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div>
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="mt-3 h-4 w-1/3" />
            <Skeleton className="mt-6 aspect-[16/9] w-full !rounded-[20px]" />
            <Skeleton className="mt-6 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-5/6" />
            <Skeleton className="mt-2 h-4 w-2/3" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-12 w-full !rounded-[12px]" />
            <Skeleton className="h-40 w-full !rounded-[16px]" />
            <Skeleton className="h-32 w-full !rounded-[16px]" />
          </div>
        </div>
      </div>
    </Container>
  );
}
