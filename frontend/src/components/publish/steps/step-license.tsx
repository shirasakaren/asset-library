'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Field } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys, STALE_TIMES } from '@/lib/api/queries';
import { useWizard } from '../wizard-context';
import type { LicenseSummary, LocaleCode } from '@/lib/api/types';

export function StepLicense() {
  const wiz = useWizard();
  const t = useTranslations('publish.licenseStep');
  const tBasics = useTranslations('publish.basics');
  const fetcher = useAuthedFetch();
  const locale = useLocale() as LocaleCode;
  const [open, setOpen] = useState(false);

  const licenses = useQuery({
    queryKey: queryKeys.licenses(locale),
    queryFn: () => fetcher<LicenseSummary[]>('/licenses', { query: { locale } }),
    staleTime: STALE_TIMES.licenses,
  });
  const license = licenses.data?.find((l) => l.id === wiz.asset.license?.id);

  return (
    <div className="space-y-5 max-w-[720px]">
      <div>
        <h2 className="font-display text-h2 text-ink tracking-[-0.01em] mb-1">{t('title')}</h2>
        <p className="text-body-sm text-ink-3">{t('subtitle')}</p>
      </div>

      {license ? (
        <div className="rounded-[16px] border border-line bg-surface-muted/50 p-5">
          <h3 className="font-display text-h3 text-ink tracking-[-0.005em]">{license.name}</h3>
          <p className="mt-2 text-body-sm text-ink-2 max-w-prose">{license.description}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setOpen(true)}>
              {tBasics('viewFullLicenseText')}
            </Button>
            <Field id="license-change" label={t('change')} className="flex-1 min-w-[240px]">
              <select
                id="license-change"
                value={wiz.asset.license?.id ?? ''}
                onChange={(e) => wiz.patch({ licenseId: e.target.value })}
                className="h-10 w-full rounded-[10px] border border-line-strong bg-surface text-[14px] text-ink px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
              >
                {licenses.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      ) : (
        <Field id="license-pick" label={t('change')}>
          <select
            id="license-pick"
            value={wiz.asset.license?.id ?? ''}
            onChange={(e) => wiz.patch({ licenseId: e.target.value })}
            className="h-11 w-full rounded-[12px] border border-line-strong bg-surface text-[15px] text-ink px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            <option value="">—</option>
            {licenses.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {open && license ? (
        <LicenseFullText licenseId={license.id} onOpenChange={setOpen} />
      ) : null}
    </div>
  );
}

function LicenseFullText({
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
        </ModalHeader>
        <pre className="whitespace-pre-wrap text-[13.5px] leading-[1.65] text-ink-2 font-sans max-h-[60vh] overflow-y-auto">
          {detail.data?.fullText ?? 'Loading…'}
        </pre>
      </ModalContent>
    </Modal>
  );
}
