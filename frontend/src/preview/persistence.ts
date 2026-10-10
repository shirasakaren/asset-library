'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getDb } from '@/preview';
import { toast } from '@/components/ui/toaster';

/** One toast per page load, however many components subscribe. */
let toastShown = false;

/** Test hook: lets each test observe the one-time toast again. */
export function __resetPersistenceToastForTests(): void {
  toastShown = false;
}

/**
 * Whether the visitor's changes are being saved (IndexedDB overlay healthy).
 * `true` until the db says otherwise, so the warning never flashes while it boots. The first time
 * storage turns out to be unavailable (at boot, or a failed write such as QuotaExceededError)
 * a single error toast is shown.
 */
export function usePersistenceState(): boolean {
  const t = useTranslations('preview');
  const message = useRef(t('storageFullToast'));
  message.current = t('storageFullToast');
  const [persistent, setPersistent] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let off: (() => void) | undefined;

    const apply = (value: boolean) => {
      if (cancelled) return;
      setPersistent(value);
      if (!value && !toastShown) {
        toastShown = true;
        toast.error(message.current);
      }
    };

    getDb().then(
      (db) => {
        if (cancelled) return;
        if (!db.persistent) apply(false);
        off = db.onPersistenceChange?.(apply);
      },
      () => {
        // The db itself failed to build: the app shows its own error; no storage warning here.
      },
    );

    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  return persistent;
}
