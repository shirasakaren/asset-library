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
        />
        <div className="relative mt-auto h-full flex flex-col justify-end p-7 md:p-10 max-w-[680px]">
          <Badge variant="solid" size="md" className="mb-4 bg-white/15 text-white border-white/0 backdrop-blur-[6px]">
            {t('featuredEyebrow')}
          </Badge>
          <h2 className="display-lg !text-white leading-[1.04]">
            <NextLink
              href={`/assets/${current.assetSlug}`}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e1116]"
            >
              {current.title}
            </NextLink>
          </h2>
          <p className="mt-3 text-body-lg text-white/85 line-clamp-2 max-w-[560px]">
            {current.shortDescription}
          </p>
          <div className="mt-7 flex items-center gap-3">
            <Button asChild size="lg" variant="primary">
              <NextLink href={`/assets/${current.assetSlug}`}>View asset</NextLink>
            </Button>
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? t('resumeRotation') : t('pauseRotation')}
              className="hidden md:inline-flex h-10 w-10 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white transition-colors duration-120 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              {paused ? <Play className="h-4 w-4" strokeWidth={2.25} /> : <Pause className="h-4 w-4" strokeWidth={2.25} />}
            </button>
          </div>
        </div>

        {reachedEnd ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(14,17,22,0.78)] backdrop-blur-[4px]">
            <div className="text-center px-6 max-w-[420px]">
              <p className="text-body-lg text-white/90">{t('featuredEnd')}</p>
              <Button onClick={restart} className="mt-5" variant="primary" leadingIcon={<RotateCcw className="h-4 w-4" strokeWidth={2.25} />}>
                {t('featuredRestart')}
              </Button>
            </div>
          </div>
        ) : null}

        {/* Arrows */}
        <button
          type="button"
          aria-label={t('previousSlide')}
          onClick={() => goTo(index - 1)}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-20 h-11 w-11 inline-flex items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-[8px] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-200 hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          aria-label={t('nextSlide')}
          onClick={() => goTo(index + 1)}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-20 h-11 w-11 inline-flex items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-[8px] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-200 hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2.25} />
        </button>

        {/* Dots */}
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5"
          role="tablist"
        >
          {slots.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={t('goToSlide', { n: i + 1 })}
              onClick={() => goTo(i)}
              className={cn(
                'h-1.5 rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80',
              )}
            />
          ))}
        </div>
      </article>
    </section>
  );
}
