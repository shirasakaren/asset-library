'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { logEvent } from '@/lib/logger.events';

export function usePageView(name: string, params?: Record<string, unknown>) {
  const pathname = usePathname();
  useEffect(() => {
    logEvent('page.view', { name, pathname, ...params });
    // intentionally re-fire when name/pathname change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, pathname]);
}
