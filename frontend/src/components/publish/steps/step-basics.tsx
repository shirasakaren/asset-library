'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Field, Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription } from '@/components/ui/modal';
import { Alert } from '@/components/ui/alert';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys, STALE_TIMES } from '@/lib/api/queries';
import { useWizard } from '../wizard-context';
import type { Category, Engine, LicenseSummary, LocaleCode } from '@/lib/api/types';

const ENGINES: { value: Engine; label: string; hint?: string }[] = [
  { value: 'UNITY', label: 'Unity', hint: 'Unity 2021+ / 6000+' },
  { value: 'UNREAL', label: 'Unreal', hint: 'UE 5.x' },
  { value: 'BLENDER', label: 'Blender', hint: '.blend, Eevee / Cycles' },
  { value: 'STANDALONE_3D', label: '3D General', hint: '.fbx / .glb / .obj / .usd' },
  { value: 'AUDIO', label: 'Audio', hint: '.wav / .mp3 / .ogg' },
  { value: 'IMAGE', label: 'Image', hint: '.png / .jpg / .exr / textures' },
  { value: 'VIDEO', label: 'Video', hint: '.mp4 / .mov' },
  { value: 'OTHER', label: 'Other engine', hint: 'Godot, CryEngine, custom' },
  { value: 'ENGINE_AGNOSTIC', label: 'Engine-agnostic' },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

export function StepBasics() {
  const wiz = useWizard();
  const t = useTranslations('publish.basics');
  const fetcher = useAuthedFetch();
  const locale = useLocale() as LocaleCode;
  const isPublished = wiz.asset.status === 'PUBLISHED';

  const categories = useQuery({
    queryKey: queryKeys.categories(locale),
    queryFn: () => fetcher<Category[]>('/categories', { query: { locale } }),
    staleTime: STALE_TIMES.categories,
  });
  const licenses = useQuery({
    queryKey: queryKeys.licenses(locale),
    queryFn: () => fetcher<LicenseSummary[]>('/licenses', { query: { locale } }),
    staleTime: STALE_TIMES.licenses,
  });

  const [licensePreviewOpen, setLicensePreviewOpen] = useState(false);
  const license = licenses.data?.find((l) => l.id === wiz.asset.license?.id);

  return (
    <div className="space-y-6 max-w-[640px]">
      <Field id="title" label={t('title')} helper={t('titleHelper')} required>
        <Input
          id="title"
          defaultValue={wiz.asset.title}
          maxLength={120}
          onChange={(e) => wiz.patch({ title: e.target.value })}
        />
      </Field>
      <Field id="slug" label={t('slug')} helper={t('slugHelper')}>
        <Input
          id="slug"
          defaultValue={wiz.asset.slug}
          onChange={(e) => wiz.patch({ slug: slugify(e.target.value) })}
          disabled={isPublished}
        />
      </Field>

      <Field label={t('engine')} required>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ENGINES.map((e) => {
            const active = wiz.asset.engine === e.value;
            return (
              <label
                key={e.value}
                className={`flex items-start gap-2.5 p-3 rounded-[12px] border cursor-pointer transition-colors duration-120 ${
                  active ? 'border-ink bg-surface-muted/60' : 'border-line hover:border-ink/40'
                } ${isPublished ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <input
                  type="radio"
                  name="engine"
                  checked={active}
                  disabled={isPublished}
                  onChange={() => wiz.patch({ engine: e.value })}
                  className="h-4 w-4 mt-0.5 accent-ink shrink-0"
                />
                <div className="min-w-0">
                  <span className="block text-[14px] font-medium text-ink truncate">{e.label}</span>
                  {e.hint ? (
                    <span className="block text-caption text-ink-3 truncate">{e.hint}</span>
                  ) : null}
                </div>
              </label>
            );
          })}
        </div>
        {isPublished ? (
          <p className="mt-2 text-caption text-ink-3">
            {t('engine')} — locked after publish.
          </p>
        ) : null}
      </Field>

      <Field id="category" label={t('category')} required>
        <select
          id="category"
          value={wiz.asset.category?.id ?? ''}
          onChange={(e) => wiz.patch({ categoryId: e.target.value })}
          className="h-11 w-full rounded-[12px] border border-line-strong bg-surface text-[15px] text-ink px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          <option value="">—</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
