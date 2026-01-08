'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ScrollAwareShellProps {
  children: ReactNode;
  className?: string;
  scrolledClassName?: string;
}

/**
 * Renders the navbar wrapper. Toggles a `data-scrolled` attribute (and the
 * `scrolledClassName`) once the page has scrolled past an invisible sentinel
 * at the top. Cheaper than a scroll listener — fires only on intersection.
 */
export function ScrollAwareShell({ children, className, scrolledClassName }: ScrollAwareShellProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!(entry?.isIntersecting ?? true)),
      { rootMargin: '0px', threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-1 w-full" />
      <header
        data-scrolled={scrolled || undefined}
        className={cn(
          'sticky top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-200 ease-out-soft',
          scrolled ? scrolledClassName : className,
        )}
      >
        {children}
      </header>
    </>
  );
}
