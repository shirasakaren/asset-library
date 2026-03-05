'use client';

import { useEffect, useState } from 'react';
import NextLink from 'next/link';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { DataTable } from '@/components/admin/data-table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { avatarFromServer, getAvatarTokens } from '@/lib/avatar';
import { PromoteAdminModal } from '@/components/admin/promote-admin-modal';
import { DemoteAdminModal } from '@/components/admin/demote-admin-modal';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { useUrlState } from '@/lib/hooks/use-url-state';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { useIntersection } from '@/lib/hooks/use-intersection';
import { formatDate, formatNumber } from '@/lib/format';
import { useLocale } from 'next-intl';
import type { AdminUser, AdminUserPage } from '@/lib/api/admin-types';
import type { LocaleCode } from '@/lib/api/types';
import { cn } from '@/lib/utils';

export default function AdminUsersPage() {
  const fetcher = useAuthedFetch();
  const queryClient = useQueryClient();
  const locale = useLocale() as LocaleCode;
  const { get, setParams } = useUrlState();
  const [search, setSearch] = useState(get('q') ?? '');
  const debounced = useDebouncedValue(search, 250);
  const adminFilter = get('isAdmin') ?? 'all';

  const [promoteOpen, setPromoteOpen] = useState(false);
  const [demoteFor, setDemoteFor] = useState<AdminUser | null>(null);

  useEffect(() => {
    if ((get('q') ?? '') !== debounced) {
      setParams({ q: debounced || null, cursor: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const list = useInfiniteQuery({
    queryKey: queryKeys.adminUsers({ q: debounced, adminFilter }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetcher<AdminUserPage>('/admin/users', {
        query: {
          q: debounced || undefined,
          isAdmin: adminFilter === 'admins' ? 'true' : undefined,
          cursor: pageParam,
          limit: 50,
        },
      }),
    getNextPageParam: (last) => (last.pageInfo.hasMore ? (last.pageInfo.nextCursor ?? undefined) : undefined),
    staleTime: 30_000,
  });

  const { ref: sentinelRef, isIntersecting } = useIntersection<HTMLDivElement>();
  useEffect(() => {
    if (isIntersecting && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
  }, [isIntersecting, list]);

  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <AdminPageHeader
        title="Users"
        description="Promote, demote, and audit users."
        actions={
          <Button leadingIcon={<Plus className="h-4 w-4" strokeWidth={2.25} />} onClick={() => setPromoteOpen(true)}>
            Promote admin
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Input
          inputSize="sm"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email"
          className="w-[280px]"
        />
        <div className="inline-flex rounded-[10px] border border-line p-1">
          {(
            [
              { value: 'all', label: 'All' },
              { value: 'admins', label: 'Admins only' },
            ] as const
          ).map((opt) => {
            const active = adminFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setParams({ isAdmin: opt.value === 'all' ? null : opt.value })}
                className={cn(
                  'inline-flex items-center h-7 px-3 rounded-[8px] text-[12.5px] font-medium transition-colors',
                  active ? 'bg-ink text-white' : 'text-ink-2 hover:bg-surface-muted',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <DataTable
        rows={rows}
        empty="No users."
        columns={[
          {
            key: 'avatar',
            header: '',
            className: 'w-[44px]',
            cell: (r) => (
              <Avatar
                data={
                  r.avatar
                    ? avatarFromServer(r.avatar)
                    : getAvatarTokens({ id: r.id, displayName: r.displayName, email: r.email })
                }
                size={32}
              />
            ),
          },
          {
            key: 'name',
            header: 'Name',
            cell: (r) => (
              <NextLink href={`/admin/users/${r.id}`} className="font-medium text-ink hover:underline">
                {r.displayName}
              </NextLink>
            ),
          },
          {
            key: 'email',
            header: 'Email',
            cell: (r) => <code className="font-mono text-[12.5px] text-ink-2">{r.email}</code>,
          },
          {
            key: 'role',
            header: 'Role',
            cell: (r) =>
              r.isAdmin ? <Badge variant="info">Admin</Badge> : <Badge variant="neutral">User</Badge>,
          },
          {
            key: 'published',
            header: 'Published',
            align: 'right',
            cell: (r) => <span className="geist-tnum">{formatNumber(r.publishedAssetCount, locale)}</span>,
          },
          {
            key: 'joined',
            header: 'Joined',
            cell: (r) => <span className="text-caption text-ink-3 geist-tnum">{formatDate(r.createdAt, locale)}</span>,
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            cell: (r) =>
              r.isAdmin ? (
                <Button size="sm" variant="ghost" onClick={() => setDemoteFor(r)}>
                  Demote
                </Button>
              ) : null,
          },
        ]}
      />
      <div ref={sentinelRef} className="h-10 mt-3 text-center text-caption text-ink-3">
        {list.isFetchingNextPage ? 'Loading…' : null}
      </div>

      {promoteOpen ? (
        <PromoteAdminModal
          onOpenChange={setPromoteOpen}
          onDone={() => {
            setPromoteOpen(false);
            void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
          }}
        />
      ) : null}
      {demoteFor ? (
        <DemoteAdminModal
          user={demoteFor}
          onOpenChange={(o) => !o && setDemoteFor(null)}
          onDone={() => {
            setDemoteFor(null);
            void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
          }}
        />
      ) : null}
    </>
  );
}
