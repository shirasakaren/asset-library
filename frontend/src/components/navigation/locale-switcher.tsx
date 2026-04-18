'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Globe, Check } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';

const LOCALES = [
  { code: 'en', labelKey: 'english' as const },
  { code: 'id', labelKey: 'indonesian' as const },
];

interface LocaleSwitcherProps {
  className?: string;
}

export function LocaleSwitcher({ className }: LocaleSwitcherProps) {
  const router = useRouter();
  const t = useTranslations('locale');
  const tCommon = useTranslations('common');
  const current = useLocale();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function change(next: string) {
    if (next === current || isPending) return;
    setOpen(false);
    startTransition(async () => {
      try {
        await fetch('/api/me/locale', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: next }),
        });
      } catch {
        /* ignore — cookie set is still authoritative for now */
      }
      document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=${60 * 60 * 24 * 365}; sameSite=Lax`;
      toast.success(t('updated'));
      router.refresh();
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('switchLabel')}
          className={cn(
            'inline-flex h-10 w-10 items-center justify-center rounded-[12px] text-ink-2 hover:bg-surface-muted hover:text-ink transition-colors duration-120',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
            isPending && 'opacity-60',
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
              className="flex items-center justify-between w-full px-2.5 h-9 rounded-[8px] text-[13.5px] text-ink hover:bg-surface-muted text-left focus-visible:outline-none focus-visible:bg-surface-muted"
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-ink-3 uppercase">{opt.code}</span>
                {t(opt.labelKey)}
              </span>
              {active ? (
                <Check className="h-4 w-4 text-brand-blue" strokeWidth={2.5} />
              ) : null}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
