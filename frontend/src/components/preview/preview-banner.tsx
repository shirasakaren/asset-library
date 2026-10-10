'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, FlaskConical, X } from 'lucide-react';
import { useMe } from '@/preview/session/me-provider';
import { usePersistenceState } from '@/preview/persistence';
import { readBannerDismissed, writeBannerDismissed } from '@/preview/banner-storage';
import { ResetDemoDialog } from './reset-demo-dialog';
import { cn } from '@/lib/utils';

/**
 * Slim strip at the very top of every page: says this is a demo, that changes live only in this
 * browser, and offers "Reset demo data". When storage is unavailable it turns into a warning that
 * cannot be dismissed (the visitor is about to lose work, so it must stay visible).
 */
export function PreviewBanner() {
  const t = useTranslations('preview');
  const me = useMe();
  const persistent = usePersistenceState();
  // The shell only renders after the persona loaded client-side, so reading storage here is safe.
  const [dismissed, setDismissed] = useState(readBannerDismissed);
  const [resetOpen, setResetOpen] = useState(false);

  if (persistent && dismissed) return null;

  const dismiss = () => {
    writeBannerDismissed();
    setDismissed(true);
  };

  return (
    <>
      <div
        role="region"
        aria-label={t('bannerLabel')}
        data-testid="preview-banner"
        className={cn(
          'border-b text-[13px] leading-snug text-ink',
          persistent
            ? 'border-brand-blue/15 bg-brand-blue-50'
            : 'border-brand-yellow/40 bg-brand-yellow-50',
        )}
      >
        <div className="mx-auto flex max-w-[1536px] items-start gap-2.5 px-4 py-2 sm:items-center sm:justify-center sm:px-6">
          {persistent ? (
            <FlaskConical
              className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue sm:mt-0"
              strokeWidth={2.25}
              aria-hidden="true"
            />
          ) : (
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-[#a16800] sm:mt-0"
              strokeWidth={2.25}
              aria-hidden="true"
            />
          )}
          <p className="min-w-0 flex-1 sm:flex-none">
            {persistent ? (
              <>
                <span>{t('bannerText', { name: me.displayName })}</span>{' '}
                <button
                  type="button"
                  onClick={() => setResetOpen(true)}
                  className="link-inline font-medium"
                >
                  {t('resetDemo')}
                </button>
              </>
            ) : (
              <span>{t('bannerNotPersistent')}</span>
            )}
          </p>
          {persistent ? (
            <button
              type="button"
              onClick={dismiss}
              aria-label={t('dismiss')}
              className="hover:bg-ink/5 -mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-ink-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.25} />
            </button>
          ) : null}
        </div>
      </div>
      <ResetDemoDialog open={resetOpen} onOpenChange={setResetOpen} />
    </>
  );
}
