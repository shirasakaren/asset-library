'use client';

import { useTranslations } from 'next-intl';
import { TagCombobox } from '@/components/filters/tag-combobox';
import { useWizard } from '../wizard-context';
import { Alert } from '@/components/ui/alert';

export function StepTags() {
  const wiz = useWizard();
  const t = useTranslations('publish.tagsStep');
  const tags = wiz.asset.tags.map((t) => t.slug);

  return (
    <div className="space-y-4 max-w-[760px]">
      <div>
        <h2 className="font-display text-h2 text-ink tracking-[-0.01em] mb-1">{t('title')}</h2>
        <p className="text-body-sm text-ink-3">{t('subtitle')}</p>
      </div>

      <TagCombobox
        values={tags}
        onChange={(next) => wiz.patch({ tags: next })}
        placeholder="Add a tag…"
      />

      {tags.length > 25 ? <Alert variant="warning">{t('tooMany')}</Alert> : null}
    </div>
  );
}
