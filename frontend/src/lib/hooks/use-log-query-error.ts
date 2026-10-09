'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

/**
 * Logs a query failure that the page deliberately swallows (it renders an empty
 * state instead), so the failure is not silent.
 */
export function useLogQueryError(event: string, path: string, error: Error | null) {
  useEffect(() => {
    if (error) logger.warn(event, { path, err: error.message });
  }, [event, path, error]);
}
