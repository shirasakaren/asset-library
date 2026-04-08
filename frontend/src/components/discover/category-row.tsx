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
