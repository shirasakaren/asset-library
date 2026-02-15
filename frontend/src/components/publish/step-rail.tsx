'use client';

import { useTranslations } from 'next-intl';
import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { useWizard, WIZARD_STEPS, type WizardStep, type ChecklistItem } from './wizard-context';
import { cn } from '@/lib/utils';

const STEP_BLOCKERS: Partial<Record<WizardStep, (c: ReturnType<typeof useWizard>['checklist']) => string | null>> = {
  basics: (c) => {
    const blocking: string[] = [];
    if (c.license.status !== 'done') blocking.push('license');
    if (c.category.status !== 'done') blocking.push('category');
    if (c.semver.status !== 'done') blocking.push('semver');
    return blocking.length ? blocking.join(', ') : null;
  },
  media: (c) => (c.thumbnail.status !== 'done' ? 'thumbnail' : null),
  files: (c) => (c.files.status !== 'done' ? 'files' : null),
  description: (c) => (c.description.status !== 'done' ? 'description' : null),
  compatibility: (c) => (c.compatibility.status !== 'done' ? 'compatibility' : null),
};

export function StepRail() {
  const wiz = useWizard();
  const t = useTranslations('publish.steps');
  const tChecklist = useTranslations('publish.checklist');

  return (
    <nav aria-label="Publish steps" className="lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto pr-1">
      <ol className="flex flex-col gap-1">
        {WIZARD_STEPS.map((s, i) => {
          const active = wiz.step === s;
          const blocker = STEP_BLOCKERS[s]?.(wiz.checklist);
          const idx = i + 1;
          return (
            <li key={s}>
              <button
                type="button"
                onClick={() => wiz.setStep(s)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'group w-full flex items-center gap-3 p-2.5 rounded-[10px] text-left',
                  'transition-colors duration-120',
                  active ? 'bg-surface-muted text-ink' : 'text-ink-2 hover:bg-surface-muted/60 hover:text-ink',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold border',
                    active ? 'bg-ink text-white border-ink' : 'bg-surface text-ink-2 border-line-strong',
                  )}
