import { Container } from '@/components/layout/container';
import { Skeleton } from '@/components/ui/skeleton';

interface PageSkeletonProps {
  size?: 'md' | 'lg' | '2xl';
  /** Number of content blocks under the title row. */
  rows?: number;
}

/** Generic pending UI for client-rendered pages: a title row and stacked content blocks. */
export function PageSkeleton({ size = 'lg', rows = 3 }: PageSkeletonProps) {
  return (
    <Container size={size}>
      <div role="status" aria-label="Loading" className="pb-20 pt-6">
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="mt-3 h-4 w-1/2" />
        <div className="mt-8 space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full !rounded-[16px]" />
          ))}
        </div>
      </div>
    </Container>
  );
}
