'use client';

import NextLink from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ThumbnailImage } from '@/components/asset/thumbnail-image';
import { usePrefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import type { FeaturedSlot } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface FeaturedCarouselProps {
  slots: FeaturedSlot[];
  className?: string;
}

const ROTATE_MS = 5000;

export function FeaturedCarousel({ slots, className }: FeaturedCarouselProps) {
  const t = useTranslations('discover');
  const prefersReduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const userInteracted = useRef(false);

  const count = slots.length;
  const safe = count > 0;
  const canAutoRotate = safe && !prefersReduced && !paused && !reachedEnd && !userInteracted.current;

  const advance = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= count) {
        setReachedEnd(true);
        return i;
      }
      return i + 1;
    });
  }, [count]);

  useEffect(() => {
    if (!canAutoRotate) return;
    const id = setTimeout(advance, ROTATE_MS);
    return () => clearTimeout(id);
  }, [index, canAutoRotate, advance]);

  const goTo = useCallback(
    (next: number) => {
      userInteracted.current = true;
      setReachedEnd(false);
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  const restart = () => {
    userInteracted.current = false;
    setReachedEnd(false);
    setIndex(0);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement)) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goTo(index - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goTo(index + 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, goTo]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  if (!safe) return null;
  const current = slots[index]!;

  return (
    <section
      ref={containerRef}
      aria-roledescription="carousel"
      aria-label={t('featuredEyebrow')}
      className={cn('group relative', className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <article
        className="relative isolate overflow-hidden rounded-[28px] bg-surface-inverse text-white min-h-[420px] md:min-h-[480px]"
      >
        <div className="absolute inset-0">
          <ThumbnailImage
            src={current.bannerUrl}
            alt={current.title}
            priority
            className="!rounded-[28px]"
            sizes="(min-width: 1280px) 1280px, 100vw"
            unoptimized
          />
        </div>
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-tr from-[rgba(14,17,22,0.85)] via-[rgba(14,17,22,0.45)] to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
