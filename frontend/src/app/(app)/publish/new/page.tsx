'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocale, useTranslations } from 'next-intl';
import { Container } from '@/components/layout/container';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys, STALE_TIMES } from '@/lib/api/queries';
import type { Category, LicenseSummary, LocaleCode } from '@/lib/api/types';

const Schema = z.object({
  title: z.string().min(3).max(120),
  engine: z.enum(['UNITY', 'UNREAL', 'ENGINE_AGNOSTIC']),
  categoryId: z.string().min(1),
  licenseId: z.string().min(1),
  semver: z.string().regex(/^\d+\.\d+\.\d+$/, 'Format MAJOR.MINOR.PATCH'),
});
type FormValues = z.infer<typeof Schema>;

export default function NewDraftPage() {
  const fetcher = useAuthedFetch();
  const router = useRouter();
  const t = useTranslations('publish');
  const locale = useLocale() as LocaleCode;
  const [error, setError] = useState<string | null>(null);

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

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { title: '', engine: 'UNITY', categoryId: '', licenseId: '', semver: '1.0.0' },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const created = await fetcher<{ id: string; slug: string }>('/assets', {
        method: 'POST',
        body: {
          title: values.title,
          engine: values.engine,
          categoryId: values.categoryId,
          licenseId: values.licenseId,
          semver: values.semver,
          translations: [
            { locale: 'en', shortDescription: '', longDescription: { type: 'doc', content: [] } },
          ],
        },
      });
      router.push(`/publish/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create draft');
    }
  };

  return (
    <Container size="md">
      <div className="pt-6 pb-20">
        <Breadcrumbs items={[{ label: t('title'), href: '/publish' }, { label: t('newDraft.title') }]} />
        <Card padding="lg" className="mt-6">
          <h1 className="font-display text-display-lg text-ink tracking-[-0.02em]">
            {t('newDraft.title')}
          </h1>
          <p className="mt-2 text-body text-ink-2 max-w-prose">{t('newDraft.body')}</p>

          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-5" noValidate>
            <Field id="nd-title" label="Title" required error={form.formState.errors.title?.message}>
              <Input id="nd-title" {...form.register('title')} placeholder="Demo asset" />
            </Field>

            <Field label="Engine" required>
              <div className="grid sm:grid-cols-3 gap-2">
                {(
                  [
                    { value: 'UNITY', label: 'Unity' },
                    { value: 'UNREAL', label: 'Unreal' },
                    { value: 'ENGINE_AGNOSTIC', label: 'Engine-agnostic' },
                  ] as const
                ).map((opt) => {
                  const active = form.watch('engine') === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2.5 p-3 rounded-[12px] border cursor-pointer transition-colors duration-120 ${
                        active ? 'border-ink bg-surface-muted/60' : 'border-line hover:border-ink/40'
                      }`}
                    >
                      <input type="radio" value={opt.value} {...form.register('engine')} className="h-4 w-4 accent-ink" />
                      <span className="text-[14px] font-medium text-ink">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-caption text-ink-3">{t('newDraft.engineImmutable')}</p>
