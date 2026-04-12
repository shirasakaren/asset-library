'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { Field, Input, Textarea } from '@/components/ui/input';
import { AdminListSkeleton } from './admin-list-skeleton';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { toast } from '@/components/ui/toaster';
import { ApiError } from '@/lib/api/errors';
import type { AdminLicense } from '@/lib/api/admin-types';
import { cn } from '@/lib/utils';

export function AdminLicensesSurface() {
  const fetcher = useAuthedFetch();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminLicense | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: queryKeys.adminLicenses,
    queryFn: () => fetcher<AdminLicense[]>('/admin/licenses'),
    staleTime: 30_000,
  });

  const toggle = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetcher(`/admin/licenses/${id}`, { method: 'PATCH', body: { isActive } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminLicenses }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => fetcher(`/admin/licenses/${id}`, { method: 'DELETE' }),
    onSuccess: () => toast.success('License deleted'),
    onError: (err) => {
      if (ApiError.isApiError(err) && err.status === 409) {
        toast.error('License is in use by published assets.');
      } else {
        toast.error(err instanceof Error ? err.message : 'Could not delete');
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminLicenses }),
  });

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-caption text-ink-3 geist-tnum">
          {list.isPending ? 'Loading…' : `${list.data?.length ?? 0} licenses`}
        </p>
        <Button leadingIcon={<Plus className="h-4 w-4" strokeWidth={2.25} />} onClick={() => setCreating(true)}>
          New license
        </Button>
      </div>

      {list.isPending ? (
        <AdminListSkeleton rows={5} />
      ) : list.isError ? (
        <Card padding="md" className="text-caption text-brand-red">
          Failed to load licenses: {list.error instanceof Error ? list.error.message : String(list.error)}
        </Card>
      ) : (
      <Card padding="none">
        <ul className="divide-y divide-line">
          {(list.data ?? []).map((lic) => (
            <li key={lic.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-ink truncate">{lic.name}</p>
                <p className="text-caption text-ink-3 font-mono truncate">{lic.slug}</p>
              </div>
              <Badge variant={lic.assetCount > 0 ? 'info' : 'neutral'}>{lic.assetCount} assets</Badge>
              <Switch checked={lic.isActive} onCheckedChange={(c) => toggle.mutate({ id: lic.id, isActive: c === true })} />
              <Button variant="ghost" size="sm" onClick={() => setEditing(lic)} leadingIcon={<Pencil className="h-3.5 w-3.5" strokeWidth={2.25} />}>
                Edit
              </Button>
              <button
                type="button"
                disabled={lic.assetCount > 0}
                onClick={() => remove.mutate(lic.id)}
                aria-label="Delete"
                title={lic.assetCount > 0 ? 'License in use' : 'Delete license'}
                className={cn(
