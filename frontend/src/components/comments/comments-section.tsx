'use client';

import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { CommentComposer } from './comment-composer';
import { CommentThread } from './comment-thread';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { useWsStore } from '@/lib/ws';
import { toast } from '@/components/ui/toaster';
import { logEvent } from '@/lib/logger.events';
import type {
  AssetDetail,
  CommentKind,
  CommentListResponse,
  CommentNode,
  IssueStatus,
  MeResponse,
  TipTapDoc,
} from '@/lib/api/types';

interface CommentsSectionProps {
  asset: AssetDetail;
  me: MeResponse;
}

type FilterKind = 'ALL' | 'COMMENT' | 'ISSUE';

export function CommentsSection({ asset, me }: CommentsSectionProps) {
  const t = useTranslations('comments');
  const fetcher = useAuthedFetch();
  const queryClient = useQueryClient();
  const subscribe = useWsStore((s) => s.subscribe);
  const [kind, setKind] = useState<FilterKind>('ALL');
  const [issueStatus, setIssueStatus] = useState<IssueStatus | 'ALL'>('ALL');
  const [pendingNew, setPendingNew] = useState(0);

  const query = useInfiniteQuery({
    queryKey: queryKeys.comments(asset.id, { kind }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetcher<CommentListResponse>(`/assets/${asset.id}/comments`, {
        query: { kind, cursor: pageParam, limit: 20 },
      }),
    getNextPageParam: (last) => (last.pageInfo.hasMore ? (last.pageInfo.nextCursor ?? undefined) : undefined),
    staleTime: 30_000,
  });

  // Live updates.
  useEffect(() => {
    const offs = [
      subscribe('comment.created', (msg) => {
        const p = (msg.payload ?? {}) as { assetId?: string };
        if (p.assetId !== asset.id) return;
        // Defer reload behind a banner so the user's scroll position is kept.
        setPendingNew((n) => n + 1);
      }),
      subscribe('comment.reply', (msg) => {
        const p = (msg.payload ?? {}) as { assetId?: string };
        if (p.assetId !== asset.id) return;
        setPendingNew((n) => n + 1);
      }),
      subscribe('comment.deleted', () => {
        // Optimistic: just refetch the page; the renderer marks the node as removed.
        void queryClient.invalidateQueries({ queryKey: queryKeys.comments(asset.id, { kind }) });
      }),
      subscribe('issue.status_changed', () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.comments(asset.id, { kind }) });
      }),
    ];
    return () => offs.forEach((fn) => fn());
  }, [subscribe, asset.id, queryClient, kind]);

  const submitMutation = useMutation({
    mutationFn: async (input: { kind: CommentKind; parentId?: string; body: TipTapDoc }) => {
      await fetcher(`/assets/${asset.id}/comments`, {
        method: 'POST',
        body: input,
      });
    },
    onSuccess: () => {
      logEvent('comment.submit', { assetId: asset.id });
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(asset.id, { kind }) });
      setPendingNew(0);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Comment failed');
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: TipTapDoc }) =>
      fetcher(`/comments/${id}`, { method: 'PATCH', body: { body } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(asset.id, { kind }) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      fetcher(`/comments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(asset.id, { kind }) });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: IssueStatus }) =>
      fetcher(`/comments/${id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(asset.id, { kind }) });
    },
  });

  const allItems: CommentNode[] = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );

  const visibleItems = useMemo(
    () =>
      issueStatus === 'ALL' || kind !== 'ISSUE'
        ? allItems
        : allItems.filter((c) => c.status === issueStatus),
    [allItems, issueStatus, kind],
  );

  const totalCount = allItems.length;
  const isOwner = asset.owner.id === me.id;

  return (
    <section className="mt-16">
      <h2 className="font-display text-h1 text-ink tracking-[-0.015em] mb-2 inline-flex items-center gap-2">
        {t('heading')}
        <span className="text-caption text-ink-3 geist-tnum font-medium">{totalCount}</span>
      </h2>

      <Tabs value={kind} onValueChange={(v) => setKind(v as FilterKind)} className="mb-6">
        <TabsList>
          <TabsTrigger value="ALL">{t('tabs.all')}</TabsTrigger>
          <TabsTrigger value="COMMENT">{t('tabs.comments')}</TabsTrigger>
          <TabsTrigger value="ISSUE">{t('tabs.issues')}</TabsTrigger>
        </TabsList>
        {kind === 'ISSUE' ? (
          <TabsContent value="ISSUE" className="mt-3">
            <div className="flex items-center gap-2 mb-2">
              {(
                [
                  { value: 'ALL', label: t('filter.all') },
                  { value: 'OPEN', label: t('filter.open') },
                  { value: 'ACKNOWLEDGED', label: t('filter.acknowledged') },
                  { value: 'RESOLVED', label: t('filter.resolved') },
                ] as const
              ).map((opt) => {
                const active = issueStatus === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setIssueStatus(opt.value as IssueStatus | 'ALL')}
                    className={`inline-flex items-center h-7 px-2.5 rounded-full text-[12.5px] font-medium border transition-colors ${
                      active
                        ? 'bg-ink text-white border-ink'
                        : 'bg-surface text-ink-2 border-line hover:border-ink/30 hover:text-ink'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </TabsContent>
        ) : null}
      </Tabs>

      <CommentComposer
        me={me}
        onSubmit={(input) => submitMutation.mutateAsync(input)}
      />

      {pendingNew > 0 ? (
        <button
          type="button"
          onClick={() => {
            void query.refetch();
            setPendingNew(0);
          }}
          className="mt-4 w-full inline-flex items-center justify-center h-9 rounded-[10px] bg-brand-blue-50 text-brand-blue font-medium text-[13.5px] hover:bg-brand-blue-50/80 transition-colors"
        >
          {t('newCommentsBanner', { count: pendingNew })}
        </button>
      ) : null}

      <div className="mt-6">
        {query.isPending ? (
          <div className="py-8 text-center text-ink-3 inline-flex items-center justify-center w-full gap-2">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
            Loading…
          </div>
        ) : visibleItems.length === 0 ? (
          <EmptyState
            title={t('emptyTitle')}
            description={t('emptyBody')}
            seed="comments-empty"
            pattern={false}
          />
        ) : (
          <ul className="space-y-3">
            {visibleItems.map((node) => (
              <li key={node.id}>
                <CommentThread
                  node={node}
                  me={me}
                  isAssetOwner={isOwner}
                  onReply={(parentId, body) =>
                    submitMutation.mutateAsync({ kind: 'COMMENT', parentId, body })
                  }
                  onEdit={async (id, body) => {
                    await editMutation.mutateAsync({ id, body });
                  }}
                  onDelete={async (id) => {
                    await deleteMutation.mutateAsync(id);
                  }}
                  onStatus={async (id, status) => {
                    await statusMutation.mutateAsync({ id, status });
                  }}
                />
              </li>
            ))}
          </ul>
        )}

        {query.hasNextPage ? (
          <div className="mt-6 flex justify-center">
            <Button variant="ghost" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage}>
              {t('loadOlder')}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
