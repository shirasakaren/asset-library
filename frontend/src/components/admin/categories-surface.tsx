'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { AdminListSkeleton } from './admin-list-skeleton';
import { CategoryEditModal } from './category-edit-modal';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { toast } from '@/components/ui/toaster';
import { ApiError } from '@/lib/api/errors';
import type { AdminCategory } from '@/lib/api/admin-types';
import { cn } from '@/lib/utils';

export function AdminCategoriesSurface() {
  const fetcher = useAuthedFetch();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: queryKeys.adminCategories,
    queryFn: () => fetcher<AdminCategory[]>('/admin/categories'),
    staleTime: 30_000,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const reorder = useMutation({
    mutationFn: async (orderedIds: string[]) =>
      fetcher('/admin/categories/reorder', { method: 'POST', body: { orderedIds } }),
    onMutate: async (orderedIds) => {
      const prev = queryClient.getQueryData<AdminCategory[]>(queryKeys.adminCategories);
      queryClient.setQueryData<AdminCategory[]>(queryKeys.adminCategories, (cur) => {
        if (!cur) return cur;
        const rank = new Map(orderedIds.map((id, idx) => [id, idx]));
        return [...cur].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.adminCategories, ctx.prev);
      toast.error('Reorder failed');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminCategories }),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetcher(`/admin/categories/${id}`, { method: 'PATCH', body: { isActive } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminCategories }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => fetcher(`/admin/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => toast.success('Category deleted'),
    onError: (err) => {
      if (ApiError.isApiError(err) && err.status === 409) {
        toast.error('Category is in use', {
          description: 'Move or archive assets in this category first.',
        });
      } else {
        toast.error(err instanceof Error ? err.message : 'Could not delete');
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminCategories }),
  });

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id || !list.data) return;
    const oldIdx = list.data.findIndex((c) => c.id === active.id);
    const newIdx = list.data.findIndex((c) => c.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(list.data, oldIdx, newIdx);
    reorder.mutate(next.map((c) => c.id));
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-caption text-ink-3 geist-tnum">
          {list.isPending ? 'Loading…' : `${list.data?.length ?? 0} categories`}
        </p>
        <Button leadingIcon={<Plus className="h-4 w-4" strokeWidth={2.25} />} onClick={() => setCreating(true)}>
          New category
        </Button>
      </div>

      {list.isPending ? (
        <AdminListSkeleton rows={6} />
      ) : list.isError ? (
        <Card padding="md" className="text-caption text-brand-red">
          Failed to load categories: {list.error instanceof Error ? list.error.message : String(list.error)}
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={(list.data ?? []).map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <Card padding="none">
              <ul className="divide-y divide-line">
