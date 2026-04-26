'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Plus, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { RequestForm } from './request-form';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { formatRelative } from '@/lib/format';
import { useLocale } from 'next-intl';
import type {
  AssetRequest,
  AssetRequestListPage,
  AssetRequestStatus,
  LocaleCode,
  MeResponse,
} from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface Props {
  me: MeResponse;
  initial: AssetRequest[];
}

const STATUS_VARIANT: Record<AssetRequestStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  SENT: 'neutral',
  IN_REVIEW: 'info',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

export function RequestSurface({ me, initial }: Props) {
  const t = useTranslations('request');
  const fetcher = useAuthedFetch();
  const locale = useLocale() as LocaleCode;
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);

  const list = useQuery({
    queryKey: queryKeys.assetRequests({ requesterId: me.id }),
    queryFn: () =>
      fetcher<AssetRequestListPage>('/asset-requests', { query: { limit: 50 } }),
    initialData: { items: initial, pageInfo: { nextCursor: null, hasMore: false } },
    staleTime: 30_000,
  });

  const items = list.data?.items ?? initial;
  const selected = items.find((r) => r.id === selectedId) ?? items[0] ?? null;

  if (items.length === 0) {
    return (
      <div>
        <Header onNew={() => setOpen(true)} />
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyBody')}
          seed="request-empty"
          primaryAction={
            <Button leadingIcon={<Plus className="h-4 w-4" strokeWidth={2.25} />} onClick={() => setOpen(true)}>
              {t('newRequest')}
            </Button>
          }
        />
        {open ? (
          <RequestForm
            me={me}
            open={open}
            onOpenChange={setOpen}
            onCreated={() => {
              setOpen(false);
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <Header onNew={() => setOpen(true)} />
      <div className="mt-8 grid lg:grid-cols-[360px_1fr] gap-6">
        <aside className="lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-2">{t('history')}</p>
          <ul className="space-y-2">
            {items.map((r) => {
              const active = selected?.id === r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={cn(
                      'w-full text-left p-3 rounded-[12px] border transition-colors duration-120',
                      active
                        ? 'border-ink bg-surface-muted/60'
                        : 'border-line hover:border-ink/30 hover:bg-surface-muted/40',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={STATUS_VARIANT[r.status]} size="sm">
                        {t(`status.${r.status}` as 'status.SENT')}
                      </Badge>
                      <span className="text-caption text-ink-3 geist-tnum">
                        {formatRelative(r.createdAt, locale)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[14px] font-medium text-ink truncate">{r.assetType}</p>
                    <p className="text-caption text-ink-3 truncate font-mono">{r.assetLink}</p>
                    {r.adminComment ? (
                      <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-brand-blue">
                        {t('adminComment')}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section>
          {selected ? (
            <Card padding="lg">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant={STATUS_VARIANT[selected.status]}>
                  {t(`status.${selected.status}` as 'status.SENT')}
                </Badge>
                <span className="text-caption text-ink-3 geist-tnum">
                  {formatRelative(selected.createdAt, locale)}
                </span>
              </div>
              <h2 className="font-display text-h2 text-ink tracking-[-0.01em]">{selected.assetType}</h2>
              <a
                href={selected.assetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 link-inline break-all"
              >
                {selected.assetLink}
                <ExternalLink className="h-3 w-3" strokeWidth={2.25} />
              </a>

              <dl className="mt-6 grid sm:grid-cols-2 gap-4">
                <Detail label={t('form.intendedUse')} value={selected.intendedUse} block />
                {selected.price ? <Detail label={t('form.price')} value={`$${selected.price}`} /> : null}
                {selected.notes ? <Detail label={t('form.notes')} value={selected.notes} block /> : null}
              </dl>

              <hr className="my-6 border-line" />
              <div>
                <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-2">
                  {t('adminComment')}
                </p>
                {selected.adminComment ? (
                  <p className="text-body-sm text-ink-2 whitespace-pre-wrap">{selected.adminComment}</p>
                ) : (
                  <p className="text-body-sm text-ink-3 italic">{t('noAdminComment')}</p>
                )}
              </div>
            </Card>
          ) : (
            <p className="text-body-sm text-ink-3">{t('noSelection')}</p>
          )}
        </section>
      </div>

      {open ? (
        <RequestForm
          me={me}
          open={open}
          onOpenChange={setOpen}
          onCreated={() => {
            void list.refetch();
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function Header({ onNew }: { onNew: () => void }) {
  const t = useTranslations('request');
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-display-lg text-ink tracking-[-0.02em]">{t('title')}</h1>
        <p className="mt-1 text-body text-ink-2">{t('subtitle')}</p>
      </div>
      <Button onClick={onNew} leadingIcon={<Plus className="h-4 w-4" strokeWidth={2.25} />}>
        {t('newRequest')}
      </Button>
    </div>
  );
}

function Detail({ label, value, block }: { label: string; value: string; block?: boolean }) {
  return (
    <div className={cn(block ? 'sm:col-span-2' : '')}>
      <dt className="text-caption text-ink-3 mb-0.5">{label}</dt>
      <dd className="text-body-sm text-ink-2 whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
