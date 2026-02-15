'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Container } from '@/components/layout/container';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { VersionBadge } from '@/components/asset/version-badge';
import { RichTextEditor } from '@/components/rich-text/rich-text-editor.lazy';
import { useAuthedFetch } from '@/lib/api/client';
import { toast } from '@/components/ui/toaster';
import type { AssetDetail, LocaleCode, TipTapDoc } from '@/lib/api/types';

interface Props {
  asset: AssetDetail;
}

function cmpSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10));
  const pb = b.split('.').map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
  }
  return 0;
}

export function NewVersionForm({ asset }: Props) {
  const t = useTranslations('publish.newVersionPage');
  const router = useRouter();
  const fetcher = useAuthedFetch();
  const latest = asset.versions.find((v) => v.isLatest) ?? asset.versions[0];
  const [semver, setSemver] = useState(bump(latest?.semver ?? '1.0.0'));
  const [activeLocale, setActiveLocale] = useState<LocaleCode>('en');
  const [notes, setNotes] = useState<Record<LocaleCode, TipTapDoc | null>>({ en: null, id: null });
  const [submitting, setSubmitting] = useState(false);

  const semverInvalid = useMemo(() => {
    if (!/^\d+\.\d+\.\d+$/.test(semver)) return 'Format MAJOR.MINOR.PATCH';
    if (latest && cmpSemver(semver, latest.semver) <= 0) return t('semverHigher');
    return null;
  }, [semver, latest, t]);

  const handleCreate = async () => {
    if (semverInvalid) return;
    setSubmitting(true);
    try {
      const created = await fetcher<{ id: string }>(`/assets/${asset.id}/versions`, {
        method: 'POST',
        body: {
          semver,
          releaseNotes: Object.fromEntries(
            Object.entries(notes).filter(([, v]) => v && v.content?.length),
          ),
        },
      });
      toast.success('Version created. Continue uploading files.');
      router.push(`/publish/${asset.id}?version=${created.id}#files`);
    } catch (err) {
