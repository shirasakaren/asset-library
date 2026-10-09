'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Globe, Check } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';
import { apiFetch } from '@/lib/api/fetcher';
import { useLocaleSwitch } from '@/providers/locale-provider';
import { useRefetchMe } from '@/preview/session/me-provider';
import type { Locale } from '@/lib/env.public';

const LOCALES: { code: Locale; labelKey: 'english' | 'indonesian' }[] = [
  { code: 'en', labelKey: 'english' },
  { code: 'id', labelKey: 'indonesian' },
];

interface LocaleSwitcherProps {
  className?: string;
}

export function LocaleSwitcher({ className }: LocaleSwitcherProps) {
  const t = useTranslations('locale');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const current = useLocale();
  const [open, setOpen] = useState(false);
  const { setLocale } = useLocaleSwitch();
  const refetchMe = useRefetchMe();

  function change(next: Locale) {
    if (next === current) return;
    setOpen(false);
    // The UI switches immediately (client state + localStorage); the persona's
    // saved locale is updated in the background.
    setLocale(next);
    toast.success(t('updated'));
    void apiFetch('/auth/me/locale', { method: 'PATCH', body: { locale: next }, locale: next })
      .then(() => refetchMe())
      .catch((err: unknown) => {
        console.error('[preview] failed to save locale', err);
        toast.error(tErrors('boundaryTitle'));
      });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('switchLabel')}
          className={cn(
            'inline-flex h-10 w-10 items-center justify-center rounded-[12px] text-ink-2 transition-colors duration-120 hover:bg-surface-muted hover:text-ink',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
            className,
          )}
        >
          <Globe className="h-[18px] w-[18px]" strokeWidth={2.25} />
          <span className="sr-only">{tCommon('openMenu')}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="min-w-[220px] p-1.5">
        <div className="px-2.5 py-1 text-eyebrow uppercase tracking-[0.12em] text-ink-3">
          {t('switchLabel')}
        </div>
        {LOCALES.map((opt) => {
          const active = opt.code === current;
          return (
            <button
              key={opt.code}
              type="button"
              onClick={() => change(opt.code)}
              className="flex h-9 w-full items-center justify-between rounded-[8px] px-2.5 text-left text-[13.5px] text-ink hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-[11px] uppercase text-ink-3">{opt.code}</span>
                {t(opt.labelKey)}
              </span>
              {active ? <Check className="h-4 w-4 text-brand-blue" strokeWidth={2.5} /> : null}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
