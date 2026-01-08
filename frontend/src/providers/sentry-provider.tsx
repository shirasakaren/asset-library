'use client';

import { useEffect } from 'react';
import { initBrowserSentry } from '@/lib/sentry';

export function SentryBootstrap() {
  useEffect(() => {
    void initBrowserSentry();
  }, []);
  return null;
}
