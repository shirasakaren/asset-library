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
