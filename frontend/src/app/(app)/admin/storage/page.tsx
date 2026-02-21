'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DataTable } from '@/components/admin/data-table';
import { Input } from '@/components/ui/input';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { formatBytes } from '@/lib/format';
import { useLocale } from 'next-intl';
import type {
  AdminStorageAssetRow,
  AdminStorageUserRow,
} from '@/lib/api/admin-types';
import type { LocaleCode } from '@/lib/api/types';

function MiniSpark({ data }: { data: { date: string; bytes: number }[] }) {
  if (!data || data.length === 0) return <span aria-hidden className="text-ink-3 text-caption">—</span>;
  const max = Math.max(...data.map((d) => d.bytes), 1);
  const points = data
    .map((d, i) => `${(i / Math.max(1, data.length - 1)) * 100},${100 - (d.bytes / max) * 100}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 100" className="h-6 w-20" preserveAspectRatio="none" aria-hidden>
      <polyline fill="none" stroke="#3a6dc5" strokeWidth="2" points={points} />
    </svg>
  );
}

export default function AdminStoragePage() {
  const fetcher = useAuthedFetch();
  const locale = useLocale() as LocaleCode;
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const users = useQuery({
    queryKey: queryKeys.adminStorageUsers(date),
    queryFn: () =>
      fetcher<AdminStorageUserRow[]>('/admin/storage/users', {
        query: { date, limit: 100 },
      }),
    staleTime: 30_000,
  });

  const assets = useQuery({
    queryKey: queryKeys.adminStorageAssets(date),
    queryFn: () =>
      fetcher<AdminStorageAssetRow[]>('/admin/storage/assets', {
        query: { date, limit: 100 },
      }),
    staleTime: 30_000,
  });

  return (
    <>
      <AdminPageHeader
        title="Storage"
        description="S3 usage broken down by bucket, user, and asset."
        actions={
          <Input
            inputSize="sm"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-[170px]"
          />
        }
      />

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Card variant="tinted" padding="md">
          <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3">Users tracked</p>
          <p className="mt-1 font-display text-h1 text-ink geist-tnum">
            {users.data?.length ?? '—'}
          </p>
        </Card>
        <Card variant="tinted" padding="md">
          <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3">Assets tracked</p>
          <p className="mt-1 font-display text-h1 text-ink geist-tnum">
            {assets.data?.length ?? '—'}
          </p>
        </Card>
        <Card variant="tinted" padding="md">
          <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3">Total (users)</p>
          <p className="mt-1 font-display text-h1 text-ink geist-tnum">
            {users.data ? formatBytes(users.data.reduce((a, u) => a + u.bytes, 0), locale) : '—'}
          </p>
        </Card>
        <Card variant="tinted" padding="md">
          <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3">Total (assets)</p>
          <p className="mt-1 font-display text-h1 text-ink geist-tnum">
            {assets.data ? formatBytes(assets.data.reduce((a, x) => a + x.bytes, 0), locale) : '—'}
          </p>
        </Card>
      </section>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">By user</TabsTrigger>
          <TabsTrigger value="assets">By asset</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <DataTable
            rows={(users.data ?? []).map((u) => ({ ...u, id: u.userId }))}
            empty="No usage data."
            columns={[
              { key: 'name', header: 'User', cell: (r) => `${r.displayName} (${r.email})` },
              {
                key: 'bytes',
                header: 'Used',
                align: 'right',
                cell: (r) => <span className="geist-tnum">{formatBytes(r.bytes, locale)}</span>,
              },
              { key: 'spark', header: '30 days', cell: (r) => <MiniSpark data={r.spark} /> },
            ]}
          />
        </TabsContent>
        <TabsContent value="assets" className="mt-4">
          <DataTable
            rows={(assets.data ?? []).map((a) => ({ ...a, id: a.assetId }))}
            empty="No usage data."
            columns={[
              { key: 'title', header: 'Asset', cell: (r) => r.title },
              { key: 'owner', header: 'Owner', cell: (r) => r.ownerDisplayName },
              {
                key: 'bytes',
                header: 'Used',
                align: 'right',
                cell: (r) => <span className="geist-tnum">{formatBytes(r.bytes, locale)}</span>,
              },
              { key: 'spark', header: '30 days', cell: (r) => <MiniSpark data={r.spark} /> },
            ]}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
