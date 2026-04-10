import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AdminPageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function AdminPageHeader({ title, description, actions, className }: AdminPageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-3 mb-6', className)}>
      <div className="min-w-0">
        <h1 className="font-display text-display-lg text-ink tracking-[-0.02em] leading-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 text-body-sm text-ink-2 max-w-prose">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2 flex-wrap">{actions}</div> : null}
    </header>
  );
}
