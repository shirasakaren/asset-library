'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { publicEnv, supportedLocales, type Locale } from '@/lib/env.public';
import en from '../../messages/en.json';
import id from '../../messages/id.json';

export const LOCALE_STORAGE_KEY = 'preview.locale';

const MESSAGES: Record<Locale, typeof en> = { en, id };

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (supportedLocales as string[]).includes(v);
}

function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* storage blocked — fall through to the default */
  }
  return publicEnv.NEXT_PUBLIC_DEFAULT_LOCALE;
}

/**
 * Client-side replacement for the cookie/`getRequestConfig` locale pipeline.
 * Both message catalogs are bundled; the choice lives in `localStorage`.
 * Children render only after the stored locale was read, to avoid a flash of
 * the wrong language.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale | null>(null);

  useEffect(() => {
    setLocaleState(readStoredLocale());
  }, []);

  useEffect(() => {
    if (locale) document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* not persisted — still applies for this page view */
    }
    setLocaleState(next);
  }, []);

  const value = useMemo<LocaleContextValue | null>(
    () => (locale ? { locale, setLocale } : null),
    [locale, setLocale],
  );

  if (!locale || !value) return null;

  return (
    <LocaleContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

export function useLocaleSwitch(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocaleSwitch must be used within <LocaleProvider>');
  return ctx;
}
