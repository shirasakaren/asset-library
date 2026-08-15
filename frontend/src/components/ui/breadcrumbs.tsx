import { Fragment, type ReactNode } from 'react';
import NextLink from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: ReactNode;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center text-caption text-ink-3', className)}>
      <ol className="flex items-center gap-1.5">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <Fragment key={i}>
              <li className="inline-flex items-center">
                {item.href && !isLast ? (
                  <NextLink
                    href={item.href}
                    className="hover:text-ink transition-colors duration-120"
                  >
                    {item.label}
                  </NextLink>
                ) : (
                  <span aria-current={isLast ? 'page' : undefined} className={cn(isLast && 'text-ink font-medium')}>
                    {item.label}
                  </span>
                )}
              </li>
              {!isLast ? (
                <li aria-hidden className="inline-flex">
                  <ChevronRight className="h-3.5 w-3.5 text-ink-4" strokeWidth={2.25} />
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
