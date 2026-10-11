'use client';

import { useCallback, useEffect, useState, type RefCallback } from 'react';

/**
 * Tracks whether an element is (nearly) in the viewport. Pass the returned `ref` to the element.
 *
 * `ref` is a callback ref on purpose: list pages render their sentinel only after the first page
 * of data arrived, i.e. after this hook's first effect ran. An object ref read once on mount would
 * never see that element and infinite scroll would silently never load a second page.
 */
export function useIntersection<T extends Element>(
  options: IntersectionObserverInit = { rootMargin: '200px' },
): { ref: RefCallback<T>; isIntersecting: boolean } {
  const [node, setNode] = useState<T | null>(null);
  const [isIntersecting, setIntersecting] = useState(false);
  const { root, rootMargin, threshold } = options;

  useEffect(() => {
    if (!node) {
      setIntersecting(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setIntersecting(entry?.isIntersecting ?? false),
      { root, rootMargin, threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, root, rootMargin, threshold]);

  const ref = useCallback<RefCallback<T>>((el) => setNode(el), []);

  return { ref, isIntersecting };
}
