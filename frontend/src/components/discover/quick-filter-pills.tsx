'use client';

import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { Category } from '@/lib/api/types';

interface QuickFilterPillsProps {
  categories: Category[];
  className?: string;
}

export function QuickFilterPills({ categories, className }: QuickFilterPillsProps) {
  const t = useTranslations('discover');
  return (
    <nav
      aria-label="Quick category filters"
      className={cn(
        'relative -mx-6 md:mx-0',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 overflow-x-auto px-6 md:px-0 py-1',
          '[-ms-overflow-style:none] [scrollbar-width:none]',
          '[&::-webkit-scrollbar]:hidden',
          'scroll-pl-6 md:scroll-pl-0',
        )}
      >
        <NextLink
          href="/search"
          className="shrink-0 inline-flex items-center h-9 px-4 rounded-full bg-ink text-white text-[14px] font-medium hover:bg-[#1a1f29] transition-colors duration-120 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          {t('browseAllAssets')}
        </NextLink>
        {categories.map((cat) => (
          <NextLink
            key={cat.id}
            href={`/search?categoryIds=${cat.id}`}
            className="shrink-0 inline-flex items-center h-9 px-4 rounded-full bg-surface-muted text-ink-2 text-[14px] font-medium hover:bg-surface-muted hover:text-ink border border-line transition-colors duration-120 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            {cat.name}
            {cat.assetCount > 0 ? (
              <span className="ml-2 text-caption text-ink-3 geist-tnum">{cat.assetCount}</span>
            ) : null}
          </NextLink>
        ))}
      </div>
    </nav>
  );
}
