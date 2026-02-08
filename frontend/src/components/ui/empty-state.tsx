import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { EmptyStatePattern } from '@/components/brand/geometric-pattern';

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  seed?: string;
  className?: string;
  pattern?: ReactNode | false;
}

export function EmptyState({
  title,
  description,
  primaryAction,
  secondaryAction,
  seed,
  className,
  pattern,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center px-6 py-14 max-w-[520px] mx-auto',
        className,
      )}
    >
      {pattern === false ? null : (
        <div className="mb-7 overflow-hidden rounded-[16px] border border-line">
          {pattern ?? <EmptyStatePattern seed={seed ?? title} />}
        </div>
      )}
      <h2 className="font-display text-h2 font-semibold tracking-[-0.01em] text-ink">
        {title}
      </h2>
      {description ? (
        <p className="text-body-sm text-ink-3 mt-2 max-w-prose">{description}</p>
      ) : null}
      {(primaryAction || secondaryAction) && (
        <div className="mt-7 flex items-center gap-2">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
