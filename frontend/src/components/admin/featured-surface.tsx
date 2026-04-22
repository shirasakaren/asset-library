'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Pencil, Trash2 } from 'lucide-react';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { ApiError } from '@/lib/api/errors';
import { toast } from '@/components/ui/toaster';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { FeaturedEditModal } from './featured-edit-modal';
import type { AdminFeaturedSlot } from '@/lib/api/admin-types';
import { cn } from '@/lib/utils';

const MAX_ACTIVE = 5;

export function AdminFeaturedSurface() {
  const fetcher = useAuthedFetch();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminFeaturedSlot | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: queryKeys.adminFeatured,
    queryFn: () => fetcher<AdminFeaturedSlot[]>('/admin/featured'),
    staleTime: 30_000,
  });

  const active = useMemo(
    () =>
      (list.data ?? [])
        .filter((s) => s.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [list.data],
  );
  const inactive = useMemo(
    () => (list.data ?? []).filter((s) => !s.isActive),
    [list.data],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reorder = useMutation({
    mutationFn: async (orderedIds: string[]) =>
      fetcher('/admin/featured/reorder', { method: 'POST', body: { orderedIds } }),
    onMutate: async (orderedIds) => {
      const prev = queryClient.getQueryData<AdminFeaturedSlot[]>(queryKeys.adminFeatured);
      queryClient.setQueryData<AdminFeaturedSlot[]>(queryKeys.adminFeatured, (cur) => {
        if (!cur) return cur;
        const ranked = new Map(orderedIds.map((id, idx) => [id, idx]));
        return cur.map((s) =>
          ranked.has(s.id) ? { ...s, sortOrder: ranked.get(s.id)! } : s,
        );
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.adminFeatured, ctx.prev);
      toast.error('Reorder failed');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminFeatured }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetcher(`/admin/featured/${id}`, { method: 'PATCH', body: { isActive } }),
    onError: (err) => {
      if (ApiError.isApiError(err) && err.status === 409) {
        toast.error('Featured slot cap is 5. Deactivate another slot first.');
      } else {
        toast.error('Could not update');
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminFeatured }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => fetcher(`/admin/featured/${id}`, { method: 'DELETE' }),
    onSuccess: () => toast.success('Slot deleted'),
    onError: (err) =>
      toast.error('Could not delete', { description: err instanceof Error ? err.message : String(err) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminFeatured }),
  });

  const onDragEnd = (e: DragEndEvent) => {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const oldIdx = active.findIndex((s) => s.id === a.id);
    const newIdx = active.findIndex((s) => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(active, oldIdx, newIdx);
    reorder.mutate(next.map((s) => s.id));
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-caption text-ink-3 geist-tnum">
          {active.length} / {MAX_ACTIVE} active · {inactive.length} inactive
        </p>
        <Button leadingIcon={<Plus className="h-4 w-4" strokeWidth={2.25} />} onClick={() => setCreating(true)}>
          Feature an asset
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={active.map((s) => s.id)} strategy={rectSortingStrategy}>
          <div className="grid sm:grid-cols-2 gap-4">
            {active.map((slot) => (
              <SortableSlot
                key={slot.id}
                slot={slot}
                onEdit={() => setEditing(slot)}
                onToggle={(next) =>
                  next && active.length >= MAX_ACTIVE
                    ? toast.error('Featured slot cap is 5.')
                    : toggleActive.mutate({ id: slot.id, isActive: next })
                }
                onDelete={() => remove.mutate(slot.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {inactive.length > 0 ? (
        <details className="mt-8">
          <summary className="cursor-pointer text-caption text-ink-3 hover:text-ink">
            Inactive slots ({inactive.length})
          </summary>
          <div className="mt-3 grid sm:grid-cols-2 gap-4">
            {inactive.map((slot) => (
              <SlotCard
                key={slot.id}
                slot={slot}
                onEdit={() => setEditing(slot)}
                onToggle={(next) => {
                  if (next && active.length >= MAX_ACTIVE) {
                    toast.error('Featured slot cap is 5.');
                    return;
                  }
                  toggleActive.mutate({ id: slot.id, isActive: next });
                }}
                onDelete={() => remove.mutate(slot.id)}
              />
            ))}
          </div>
        </details>
      ) : null}

      {(editing || creating) ? (
        <FeaturedEditModal
          slot={editing}
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

function SortableSlot({
  slot,
  onEdit,
  onToggle,
  onDelete,
}: {
  slot: AdminFeaturedSlot;
  onEdit: () => void;
  onToggle: (next: boolean) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'opacity-70')}
    >
      <SlotCard
        slot={slot}
        onEdit={onEdit}
        onToggle={onToggle}
        onDelete={onDelete}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            type="button"
            aria-label="Drag to reorder"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-ink-3 hover:bg-surface-muted hover:text-ink cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" strokeWidth={2.25} />
          </button>
        }
      />
    </div>
  );
}

function SlotCard({
  slot,
  onEdit,
  onToggle,
  onDelete,
  dragHandle,
}: {
  slot: AdminFeaturedSlot;
  onEdit: () => void;
  onToggle: (next: boolean) => void;
  onDelete: () => void;
  dragHandle?: React.ReactNode;
}) {
  const banner = slot.customBannerUrl ?? null;
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="relative aspect-[16/9] bg-surface-muted">
        {banner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-ink-3 text-caption">
            Uses asset thumbnail
          </div>
        )}
        <div className="absolute top-2 left-2 right-2 flex items-center gap-2">
          {dragHandle}
          <Badge variant="solid" className="bg-white/85 !text-ink border-white/0">
            #{slot.sortOrder + 1}
          </Badge>
          {slot.isActive ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="neutral">Inactive</Badge>
          )}
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-display text-h3 text-ink tracking-[-0.005em] line-clamp-1">
          {slot.customTitle ?? slot.assetTitle}
        </h3>
        <p className="text-caption text-ink-3 truncate mt-1 font-mono">{slot.assetSlug}</p>
        <div className="mt-3 flex items-center gap-2">
          <Switch checked={slot.isActive} onCheckedChange={(c) => onToggle(c === true)} />
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<Pencil className="h-3.5 w-3.5" strokeWidth={2.25} />}
            onClick={onEdit}
            className="ml-auto"
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />}
            onClick={onDelete}
          >
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}
