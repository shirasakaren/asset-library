'use client';

import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitMerge, Pencil, Trash2 } from 'lucide-react';
import { AdminListSkeleton } from './admin-list-skeleton';
import { DataTable } from './data-table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from '@/components/ui/modal';
import { Field } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useAuthedFetch } from '@/lib/api/client';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { queryKeys } from '@/lib/api/queries';
import { toast } from '@/components/ui/toaster';
import { ApiError } from '@/lib/api/errors';
import { useIntersection } from '@/lib/hooks/use-intersection';
import { formatDate } from '@/lib/format';
import { useLocale } from 'next-intl';
import type { AdminTagPage, AdminTagRow } from '@/lib/api/admin-types';
import type { LocaleCode, Tag } from '@/lib/api/types';
import { cn } from '@/lib/utils';

export function AdminTagsSurface() {
  const fetcher = useAuthedFetch();
  const queryClient = useQueryClient();
  const locale = useLocale() as LocaleCode;
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 200);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [editing, setEditing] = useState<AdminTagRow | null>(null);

  const list = useInfiniteQuery({
    queryKey: queryKeys.adminTags({ q: debounced }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetcher<AdminTagPage>('/admin/tags', {
        query: { q: debounced || undefined, cursor: pageParam, limit: 50 },
      }),
    getNextPageParam: (last) => (last.pageInfo.hasMore ? (last.pageInfo.nextCursor ?? undefined) : undefined),
    staleTime: 30_000,
  });

  const { ref: sentinelRef, isIntersecting } = useIntersection<HTMLDivElement>();
  useEffect(() => {
    if (isIntersecting && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
  }, [isIntersecting, list]);

  const remove = useMutation({
    mutationFn: async (id: string) => fetcher(`/admin/tags/${id}`, { method: 'DELETE' }),
    onSuccess: () => toast.success('Tag deleted'),
    onError: (err) => {
      if (ApiError.isApiError(err) && err.status === 409) {
        toast.error('Tag is still in use', { description: 'Merge into another tag instead.' });
      } else {
        toast.error(err instanceof Error ? err.message : 'Could not delete');
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'tags'] }),
  });

  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Input
          inputSize="sm"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tags"
          className="w-[280px]"
        />
        <Button
          variant="secondary"
          leadingIcon={<GitMerge className="h-4 w-4" strokeWidth={2.25} />}
          onClick={() => setMergeOpen(true)}
        >
          Merge tags
        </Button>
      </div>

      {list.isPending && rows.length === 0 ? (
        <AdminListSkeleton rows={8} />
      ) : (
      <DataTable
        rows={rows}
        empty="No tags yet."
        columns={[
          {
            key: 'slug',
            header: 'Slug',
            cell: (r) => <code className="font-mono text-[12.5px] text-ink-2">{r.slug}</code>,
          },
          { key: 'name', header: 'Display name', cell: (r) => r.displayName },
          {
            key: 'usage',
            header: 'Usage',
            align: 'right',
            cell: (r) => (
              <Badge variant={r.usageCount > 0 ? 'info' : 'neutral'}>{r.usageCount}</Badge>
            ),
          },
          {
            key: 'created',
            header: 'Created',
            cell: (r) => (
              <span className="text-caption text-ink-3 geist-tnum">{formatDate(r.createdAt, locale)}</span>
            ),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            cell: (r) => (
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  aria-label="Rename"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-ink-2 hover:bg-surface-muted hover:text-ink"
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} />
                </button>
                <button
                  type="button"
                  disabled={r.usageCount > 0}
                  onClick={() => remove.mutate(r.id)}
                  aria-label="Delete"
                  title={r.usageCount > 0 ? 'Only unused tags can be deleted.' : 'Delete tag'}
                  className={cn(
                    'inline-flex h-8 w-8 items-center justify-center rounded-[8px]',
                    r.usageCount === 0
                      ? 'text-ink-3 hover:bg-brand-red-50 hover:text-brand-red'
                      : 'text-ink-4 cursor-not-allowed',
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                </button>
              </div>
            ),
          },
        ]}
      />
      )}
      <div ref={sentinelRef} className="h-10 mt-3 text-center text-caption text-ink-3">
        {list.isFetchingNextPage ? 'Loading…' : null}
      </div>

      {mergeOpen ? (
        <MergeTagsModal
          onOpenChange={setMergeOpen}
          onDone={() => {
            setMergeOpen(false);
            void list.refetch();
          }}
        />
      ) : null}
      {editing ? (
        <RenameTagModal
          tag={editing}
          onOpenChange={(o) => !o && setEditing(null)}
          onDone={() => {
            setEditing(null);
            void list.refetch();
          }}
        />
      ) : null}
    </>
  );
}

function RenameTagModal({
  tag,
  onOpenChange,
  onDone,
}: {
  tag: AdminTagRow;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const fetcher = useAuthedFetch();
  const [slug, setSlug] = useState(tag.slug);
  const [displayName, setDisplayName] = useState(tag.displayName);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await fetcher(`/admin/tags/${tag.id}`, { method: 'PATCH', body: { slug, displayName } });
      toast.success('Tag renamed');
      onDone();
    } catch (err) {
      toast.error('Could not rename', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>Rename tag</ModalTitle>
        </ModalHeader>
        <div className="space-y-3">
          <Field id="t-slug" label="Slug" required>
            <Input id="t-slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </Field>
          <Field id="t-name" label="Display name" required>
            <Input id="t-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Save
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function MergeTagsModal({
  onOpenChange,
  onDone,
}: {
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const fetcher = useAuthedFetch();
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 200);
  const [from, setFrom] = useState<Tag[]>([]);
  const [into, setInto] = useState<Tag | null>(null);
  const [busy, setBusy] = useState(false);

  const suggestions = useQuery({
    queryKey: ['admin', 'tag-suggest', debounced],
    queryFn: () => fetcher<Tag[]>('/tags', { query: { q: debounced, limit: 12 } }),
    enabled: debounced.length > 1,
    staleTime: 30_000,
  });

  const totalUsage = from.reduce((acc, t) => acc + t.usageCount, 0) + (into?.usageCount ?? 0);

  const submit = async () => {
    if (from.length === 0 || !into) return;
    setBusy(true);
    try {
      await fetcher('/admin/tags/merge', {
        method: 'POST',
        body: { fromTagIds: from.map((t) => t.id), intoTagId: into.id },
      });
      toast.success(`Merged ${from.length} tag(s) into ${into.displayName}`);
      onDone();
    } catch (err) {
      toast.error('Merge failed', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>Merge tags</ModalTitle>
          <ModalDescription>
            Pick the tag(s) to merge from, then a single tag to merge into. Every asset using a source tag will be re-tagged.
          </ModalDescription>
        </ModalHeader>
        <Field label="Search">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a tag…" />
        </Field>
        {suggestions.data?.length ? (
          <ul className="mt-2 max-h-[200px] overflow-y-auto rounded-[12px] border border-line bg-surface">
            {suggestions.data.map((t) => {
              const inFrom = from.some((f) => f.id === t.id);
              const isInto = into?.id === t.id;
              return (
                <li key={t.id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="font-medium text-[13.5px] text-ink">{t.displayName}</span>
                  <code className="text-caption text-ink-3 font-mono">{t.slug}</code>
                  <Badge variant="neutral" size="sm" className="ml-auto">
                    {t.usageCount}
                  </Badge>
                  <Button
                    size="sm"
                    variant={inFrom ? 'primary' : 'ghost'}
                    onClick={() => {
                      if (isInto) return;
                      setFrom((cur) =>
                        cur.some((c) => c.id === t.id)
                          ? cur.filter((c) => c.id !== t.id)
                          : [...cur, t],
                      );
                    }}
                  >
                    From
                  </Button>
                  <Button
                    size="sm"
                    variant={isInto ? 'accent' : 'ghost'}
                    onClick={() => {
                      setInto((cur) => (cur?.id === t.id ? null : t));
                      setFrom((cur) => cur.filter((c) => c.id !== t.id));
                    }}
                  >
                    Into
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {from.length > 0 && into ? (
          <Alert variant="info" className="mt-3">
            Merging <strong>{from.length}</strong> tag{from.length === 1 ? '' : 's'} into{' '}
            <strong>{into.displayName}</strong>. New total usage: <strong>{totalUsage}</strong>.
          </Alert>
        ) : null}

        <ModalFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={from.length === 0 || !into} loading={busy} onClick={submit}>
            Merge
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
