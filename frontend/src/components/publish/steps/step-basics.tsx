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
      </Field>

      <Field id="license" label={t('license')} required>
        <div className="flex items-stretch gap-2">
          <select
            id="license"
            value={wiz.asset.license?.id ?? ''}
            onChange={(e) => wiz.patch({ licenseId: e.target.value })}
            className="flex-1 h-11 rounded-[12px] border border-line-strong bg-surface text-[15px] text-ink px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            <option value="">—</option>
            {licenses.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          {license ? (
            <Button variant="ghost" onClick={() => setLicensePreviewOpen(true)}>
              {t('viewFullLicenseText')}
            </Button>
          ) : null}
        </div>
        {license ? (
          <p className="mt-2 text-caption text-ink-3 max-w-prose">{license.description}</p>
        ) : null}
      </Field>

      <Field id="semver" label={t('semver')} helper={t('semverHelper')} required>
        <Input
          id="semver"
          defaultValue={wiz.latestVersion?.semver ?? ''}
          placeholder="1.0.0"
          onChange={(e) => wiz.patch({ semver: e.target.value })}
          disabled={isPublished}
          inputMode="numeric"
        />
      </Field>

      {license && licensePreviewOpen ? (
        <LicenseModal licenseId={license.id} onOpenChange={setLicensePreviewOpen} />
      ) : null}

      {!categories.data?.length && !categories.isPending ? (
        <Alert variant="warning" title="No categories">
          The backend hasn't seeded any categories yet. Ask an admin to run `pnpm seed`.
        </Alert>
      ) : null}

      {!licenses.data?.length && !licenses.isPending ? (
        <Alert variant="warning" title="No licenses">
          {licenses.error
            ? `Failed to load licenses: ${licenses.error instanceof Error ? licenses.error.message : String(licenses.error)}`
            : 'No active licenses are configured. Ask an admin to run `pnpm seed`, or open Admin → Licenses and toggle `isActive` on existing rows.'}
        </Alert>
      ) : null}
    </div>
  );
}

function LicenseModal({
  licenseId,
  onOpenChange,
}: {
  licenseId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useAuthedFetch();
  const locale = useLocale() as LocaleCode;
  const detail = useQuery({
    queryKey: ['license', licenseId, locale],
    queryFn: () =>
      fetcher<{ id: string; name: string; fullText: string }>(`/licenses/${licenseId}`, {
        query: { locale },
      }),
    staleTime: 60_000,
  });
  return (
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent size="lg">
        <ModalHeader>
          <ModalTitle>{detail.data?.name ?? 'License'}</ModalTitle>
          <ModalDescription>Standard MGM-Library license text.</ModalDescription>
        </ModalHeader>
        <pre className="whitespace-pre-wrap text-[13.5px] leading-[1.65] text-ink-2 font-sans max-h-[60vh] overflow-y-auto">
          {detail.data?.fullText ?? 'Loading…'}
        </pre>
      </ModalContent>
    </Modal>
  );
}
