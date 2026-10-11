'use client';

import { useEffect } from 'react';
import { publicEnv } from '@/lib/env.public';

/**
 * Sets `document.title` to `<title> — <app name>`. Static pages get theirs from
 * Next `metadata`; this covers pages rendered by the exported `not-found` shell
 * (which have no per-route metadata) and titles that depend on loaded data.
 */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} — ${publicEnv.NEXT_PUBLIC_APP_NAME}`;
  }, [title]);
}
