import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface AdminListSkeletonProps {
  rows?: number;
  className?: string;
}

/**
 * Shimmer placeholder for admin list surfaces (categories, tags, licenses,
 * etc.). Renders during the initial fetch so the user sees activity instead
 * of a `0` count flashing into the real value.
 */
export function AdminListSkeleton({ rows = 6, className }: AdminListSkeletonProps) {
  return (
    <Card padding="none" className={className}>
      <ul className="divide-y divide-line" aria-busy="true" aria-live="polite">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <span className="h-4 w-4 rounded-[4px] bg-line/70 animate-pulse" />
            <span className="h-7 w-7 rounded-[6px] bg-line/70 animate-pulse" />
            <div className="flex-1 min-w-0">
              <span
                className={cn(
                  'block h-3.5 rounded-[4px] bg-line/70 animate-pulse',
                  i % 3 === 0 ? 'w-1/3' : i % 3 === 1 ? 'w-1/2' : 'w-2/3',
                )}
              />
              <span className="mt-2 block h-3 w-1/4 rounded-[4px] bg-line/50 animate-pulse" />
            </div>
            <span className="h-6 w-20 rounded-full bg-line/60 animate-pulse" />
            <span className="h-6 w-10 rounded-full bg-line/60 animate-pulse" />
          </li>
        ))}
      </ul>
    </Card>
  );
}
