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
                {(list.data ?? []).map((cat) => (
                  <SortableRow
                    key={cat.id}
                    cat={cat}
                    onEdit={() => setEditing(cat)}
                    onToggle={(next) => toggle.mutate({ id: cat.id, isActive: next })}
                    onDelete={() => remove.mutate(cat.id)}
                  />
                ))}
              </ul>
            </Card>
          </SortableContext>
        </DndContext>
      )}

      {(editing || creating) ? (
        <CategoryEditModal
          category={editing}
          onOpenChange={(o) => {
            if (!o) {
              setEditing(null);
              setCreating(false);
            }
          }}
          onDone={() => {
            setEditing(null);
            setCreating(false);
            void list.refetch();
          }}
        />
      ) : null}
    </>
  );
}

function SortableRow({
  cat,
  onEdit,
  onToggle,
  onDelete,
}: {
  cat: AdminCategory;
  onEdit: () => void;
  onToggle: (next: boolean) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cat.id,
  });
  const canDelete = cat.assetCount === 0;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-3 px-4 py-3',
        isDragging && 'bg-surface-muted/50',
      )}
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label="Drag"
        className="cursor-grab active:cursor-grabbing text-ink-3 hover:text-ink"
      >
        <GripVertical className="h-4 w-4" strokeWidth={2.25} />
      </button>
      {cat.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cat.iconUrl} alt="" className="h-7 w-7 rounded-[6px]" />
      ) : (
        <span className="h-7 w-7 rounded-[6px] bg-surface-muted border border-line" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-ink truncate">
          {cat.name.en || cat.slug} <span className="text-ink-3 ml-1">· {cat.name.id ?? '—'}</span>
        </p>
        <p className="text-caption text-ink-3 font-mono truncate">{cat.slug}</p>
      </div>
      <Badge variant={cat.assetCount > 0 ? 'info' : 'neutral'}>
        {cat.assetCount} assets
      </Badge>
      <Switch checked={cat.isActive} onCheckedChange={(c) => onToggle(c === true)} />
      <Button variant="ghost" size="sm" onClick={onEdit} leadingIcon={<Pencil className="h-3.5 w-3.5" strokeWidth={2.25} />}>
        Edit
      </Button>
      <button
        type="button"
        disabled={!canDelete}
        onClick={onDelete}
        aria-label="Delete"
        title={canDelete ? 'Delete category' : 'Cannot delete a category with published assets.'}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-[8px] transition-colors',
          canDelete ? 'text-ink-3 hover:bg-brand-red-50 hover:text-brand-red' : 'text-ink-4 cursor-not-allowed',
        )}
      >
        <Trash2 className="h-4 w-4" strokeWidth={2.25} />
      </button>
    </li>
  );
}
