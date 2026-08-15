'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

export function useIntersection<T extends Element>(
  options: IntersectionObserverInit = { rootMargin: '200px' },
): { ref: RefObject<T>; isIntersecting: boolean } {
  const ref = useRef<T | null>(null);
  const [isIntersecting, setIntersecting] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIntersecting(entry?.isIntersecting ?? false),
      options,
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref: ref as RefObject<T>, isIntersecting };
}
