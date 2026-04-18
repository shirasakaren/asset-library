import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Variant = 'grid' | 'compact' | 'feature' | 'row';

interface AssetCardSkeletonProps {
  variant?: Variant;
  className?: string;
}

export function AssetCardSkeleton({ variant = 'grid', className }: AssetCardSkeletonProps) {
  if (variant === 'feature') {
    return (
      <div
        className={cn(
          'rounded-[28px] min-h-[420px] md:min-h-[480px] overflow-hidden relative',
          className,
        )}
      >
        <Skeleton className="absolute inset-0 !rounded-[28px]" />
      </div>
    );
  }
  if (variant === 'compact') {
    return (
      <div className={cn('w-[220px] shrink-0 rounded-[16px] border border-line p-0', className)}>
        <Skeleton className="aspect-[16/9] !rounded-[16px] !rounded-b-none" />
        <div className="p-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2 mt-2" />
        </div>
      </div>
    );
  }
  if (variant === 'row') {
    return (
      <div className={cn('grid grid-cols-[200px_1fr_auto] gap-5 items-center p-3 rounded-[16px] border border-line', className)}>
        <Skeleton className="aspect-[16/9] w-[200px] !rounded-[12px]" />
        <div>
          <Skeleton className="h-3 w-24 mb-2" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-3/4 mt-2" />
          <Skeleton className="h-3 w-1/2 mt-2" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
    );
  }
  return (
    <div className={cn('rounded-[20px] border border-line', className)}>
      <Skeleton className="aspect-[16/9] !rounded-[20px] !rounded-b-none" />
      <div className="p-4">
        <Skeleton className="h-3 w-24 mb-2" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-full mt-2" />
        <Skeleton className="h-3 w-2/3 mt-2" />
        <Skeleton className="h-3 w-1/2 mt-4" />
      </div>
    </div>
  );
}
