'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Field, Textarea } from '@/components/ui/input';
import { RichTextEditor } from '@/components/rich-text/rich-text-editor.lazy';
import { Alert } from '@/components/ui/alert';
import { useWizard } from '../wizard-context';
import { cn } from '@/lib/utils';
import type { LocaleCode, TipTapDoc } from '@/lib/api/types';

const LOCALES: { code: LocaleCode; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'id', label: 'Bahasa Indonesia' },
];

interface TranslationDraft {
  short: string;
  long: TipTapDoc | null;
}

const PATCH_DEBOUNCE_MS = 400;

export function StepDescription() {
  const wiz = useWizard();
  const t = useTranslations('publish.description');
  const [activeLocale, setActiveLocale] = useState<LocaleCode>('en');

  // Seed local state once from the wizard. After that, the user's typing is the
  // source of truth — we push a debounced PATCH back to the wizard instead of
  // reading from it every keystroke (which used to thrash the entire wizard
  // re-render and revert in-progress edits).
  const seed = useMemo<Record<LocaleCode, TranslationDraft>>(() => {
    const existing = (wiz.asset as unknown as { translations?: Record<LocaleCode, TranslationDraft> })
      .translations;
    if (existing) return existing;
    return {
      en: { short: wiz.asset.shortDescription ?? '', long: wiz.asset.longDescription ?? null },
      id: { short: '', long: null },
    };
    // Only re-seed when the asset id changes — never per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wiz.asset.id]);

  const [drafts, setDrafts] = useState<Record<LocaleCode, TranslationDraft>>(seed);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const schedulePatch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const snapshot = draftsRef.current;
      wiz.patch({
        translations: Object.entries(snapshot).map(([code, v]) => ({
          locale: code,
          shortDescription: v.short,
          longDescription: v.long ?? { type: 'doc', content: [] },
        })),
      });
    }, PATCH_DEBOUNCE_MS);
  };

  const update = (locale: LocaleCode, patch: Partial<TranslationDraft>) => {
    setDrafts((prev) => ({ ...prev, [locale]: { ...prev[locale], ...patch } }));
    schedulePatch();
  };

  const current = drafts[activeLocale];
  const isFallback = !current.short && !current.long?.content?.length;

  return (
    <div className="space-y-5 max-w-[820px]">
      <div role="tablist" aria-label="Description languages" className="flex items-center gap-1 border-b border-line">
        {LOCALES.map((l) => {
          const active = activeLocale === l.code;
          return (
            <button
              key={l.code}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveLocale(l.code)}
              className={cn(
                'relative h-10 px-3 text-[14px] font-medium',
                active ? 'text-ink' : 'text-ink-3 hover:text-ink',
                'after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px]',
                active ? 'after:bg-brand-blue' : 'after:bg-transparent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
              )}
            >
              {l.label}
            </button>
          );
        })}
        <span className="ml-auto inline-flex h-9 items-center px-2.5 rounded-full bg-surface-muted text-caption text-ink-3 opacity-60 cursor-not-allowed">
          + {t('addLanguage')}
        </span>
      </div>

      {isFallback ? (
        <Alert variant="info">{t('fallbackNote')}</Alert>
      ) : null}

      <Field id={`short-${activeLocale}`} label={t('shortLabel')} helper={t('shortHelper')}>
        <Textarea
          id={`short-${activeLocale}`}
          rows={2}
          maxLength={280}
          value={current.short}
          onChange={(e) => update(activeLocale, { short: e.target.value })}
        />
      </Field>

      <Field id={`long-${activeLocale}`} label={t('longLabel')}>
        {/*
         * key={activeLocale} forces a fresh editor mount when switching tabs so
         * each language's saved content is loaded as initial content, but the
         * editor remains uncontrolled while the user types (no prop-resync revert).
         */}
        <RichTextEditor
          key={activeLocale}
          mode="full"
          value={current.long ?? undefined}
          onChange={(doc) => update(activeLocale, { long: doc })}
        />
      </Field>
    </div>
  );
}
