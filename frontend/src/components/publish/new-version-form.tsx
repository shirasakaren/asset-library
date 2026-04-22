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
      toast.error('Could not create version', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container size="md">
      <div className="pt-6 pb-20">
        <Breadcrumbs
          items={[
            { label: 'Publish', href: '/publish' },
            { label: asset.title, href: `/publish/${asset.id}` },
            { label: t('title') },
          ]}
        />
        <Card padding="lg" className="mt-6">
          <h1 className="font-display text-display-lg text-ink tracking-[-0.02em]">{t('title')}</h1>
          <p className="mt-2 text-body text-ink-2 max-w-prose">{t('subtitle')}</p>

          {latest ? (
            <Alert variant="neutral" className="mt-5">
              Previous latest: <VersionBadge semver={latest.semver} isLatest size="sm" />
            </Alert>
          ) : null}

          <div className="mt-6 space-y-5">
            <Field id="new-semver" label="New semver" required error={semverInvalid}>
              <Input
                id="new-semver"
                value={semver}
                onChange={(e) => setSemver(e.target.value)}
                invalid={Boolean(semverInvalid)}
              />
            </Field>

            <div>
              <div className="flex items-center gap-1 border-b border-line mb-3">
                {(['en', 'id'] as LocaleCode[]).map((l) => {
                  const active = activeLocale === l;
                  return (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setActiveLocale(l)}
                      className={`relative h-10 px-3 text-[14px] font-medium ${active ? 'text-ink' : 'text-ink-3 hover:text-ink'} after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] ${active ? 'after:bg-brand-blue' : 'after:bg-transparent'}`}
                    >
                      {l === 'en' ? 'English' : 'Bahasa Indonesia'}
                    </button>
                  );
                })}
              </div>
              <RichTextEditor
                mode="lite"
                value={notes[activeLocale]}
                onChange={(doc) => setNotes((prev) => ({ ...prev, [activeLocale]: doc }))}
                placeholder={t('releaseNotes')}
              />
            </div>
          </div>

          <div className="mt-7 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={Boolean(semverInvalid)} loading={submitting}>
              Create version
            </Button>
          </div>
        </Card>
      </div>
    </Container>
  );
}

function bump(s: string): string {
  const parts = s.split('.').map((n) => parseInt(n, 10));
  parts[2] = (parts[2] ?? 0) + 1;
  return parts.join('.');
}
