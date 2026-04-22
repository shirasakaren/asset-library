'use client';

import { useRef, useState, useEffect } from 'react';
import NextLink from 'next/link';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AssetCard } from '@/components/asset/asset-card';
import { useSavedIds } from '@/lib/hooks/use-saved-ids';
import type { AssetSummary } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface CategoryRowProps {
  categoryName: string;
  categoryId: string;
  assets: AssetSummary[];
  ownAssetIds: Set<string>;
}

export function CategoryRow({
  categoryName,
  categoryId,
  assets,
  ownAssetIds,
}: CategoryRowProps) {
  const t = useTranslations('discover');
  const savedIds = useSavedIds();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      setCanPrev(el.scrollLeft > 8);
      setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  if (assets.length === 0) return null;

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = Math.max(240, el.clientWidth - 120);
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  return (
    <section className="relative">
      <div className="flex items-end justify-between mb-4">
        <h2 className="font-display text-h1 text-ink tracking-[-0.015em]">{categoryName}</h2>
        <NextLink
          href={`/search?categoryIds=${categoryId}`}
          className="inline-flex items-center gap-1 text-[14px] text-ink-2 hover:text-ink font-medium transition-colors duration-120"
        >
          {t('categorySeeAll')}
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
        </NextLink>
      </div>
      <div className="relative group">
        <div
          ref={scrollerRef}
          className={cn(
            'flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth',
            '[-ms-overflow-style:none] [scrollbar-width:none]',
            '[&::-webkit-scrollbar]:hidden',
            '-mx-1 px-1 py-1',
          )}
        >
          {assets.map((asset) => (
            <div key={asset.id} className="snap-start">
              <AssetCard
                variant="compact"
                asset={asset}
                isSaved={savedIds.has(asset.id)}
                isOwner={ownAssetIds.has(asset.id)}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          aria-label={t('scrollLeft')}
          onClick={() => scrollBy(-1)}
          disabled={!canPrev}
          className={cn(
            'hidden md:inline-flex absolute left-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full',
            'bg-white text-ink border border-line shadow-2 transition-all duration-200',
            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            !canPrev && 'opacity-0 pointer-events-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
          )}
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          aria-label={t('scrollRight')}
          onClick={() => scrollBy(1)}
          disabled={!canNext}
          className={cn(
            'hidden md:inline-flex absolute right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full',
            'bg-white text-ink border border-line shadow-2 transition-all duration-200',
            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            !canNext && 'opacity-0 pointer-events-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
          )}
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2.25} />
        </button>
      </div>
    </section>
  );
}
