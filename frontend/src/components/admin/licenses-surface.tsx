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
                  'inline-flex h-8 w-8 items-center justify-center rounded-[8px]',
                  lic.assetCount === 0
                    ? 'text-ink-3 hover:bg-brand-red-50 hover:text-brand-red'
                    : 'text-ink-4 cursor-not-allowed',
                )}
              >
                <Trash2 className="h-4 w-4" strokeWidth={2.25} />
              </button>
            </li>
          ))}
        </ul>
      </Card>
      )}

      {(editing || creating) ? (
        <LicenseEditModal
          license={editing}
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

function LicenseEditModal({
  license,
  onOpenChange,
  onDone,
}: {
  license?: AdminLicense | null;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const fetcher = useAuthedFetch();
  const editing = Boolean(license);
  const [slug, setSlug] = useState(license?.slug ?? '');
  const [name, setName] = useState(license?.name ?? '');
  const [descEn, setDescEn] = useState(license?.description?.en ?? '');
  const [descId, setDescId] = useState(license?.description?.id ?? '');
  const [textEn, setTextEn] = useState(license?.fullText?.en ?? '');
  const [textId, setTextId] = useState(license?.fullText?.id ?? '');
  const [isActive, setIsActive] = useState(license?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const payload = {
        slug,
        name,
        description: { en: descEn, id: descId || descEn },
        fullText: { en: textEn, id: textId || textEn },
        isActive,
      };
      if (editing && license) {
        await fetcher(`/admin/licenses/${license.id}`, { method: 'PATCH', body: payload });
      } else {
        await fetcher('/admin/licenses', { method: 'POST', body: payload });
      }
      toast.success(editing ? 'Saved' : 'Created');
      onDone();
    } catch (err) {
      toast.error('Could not save', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent size="lg">
        <ModalHeader>
          <ModalTitle>{editing ? 'Edit license' : 'New license'}</ModalTitle>
        </ModalHeader>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-[1fr_2fr] gap-3">
            <Field id="l-slug" label="Slug" required>
              <Input id="l-slug" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={editing} />
            </Field>
            <Field id="l-name" label="Name" required>
              <Input id="l-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field id="l-desc-en" label="Description (EN)" required>
              <Textarea id="l-desc-en" rows={2} value={descEn} onChange={(e) => setDescEn(e.target.value)} />
            </Field>
            <Field id="l-desc-id" label="Description (ID)">
              <Textarea id="l-desc-id" rows={2} value={descId} onChange={(e) => setDescId(e.target.value)} />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field id="l-text-en" label="Full text (EN)" required>
              <Textarea
                id="l-text-en"
                rows={10}
                value={textEn}
                onChange={(e) => setTextEn(e.target.value)}
                className="font-mono text-[12.5px]"
              />
            </Field>
            <Field id="l-text-id" label="Full text (ID)">
              <Textarea
                id="l-text-id"
                rows={10}
                value={textId}
                onChange={(e) => setTextId(e.target.value)}
                className="font-mono text-[12.5px]"
              />
            </Field>
          </div>
          <label className="inline-flex items-center gap-2 text-[13.5px] text-ink cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-ink" />
            Active
          </label>
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            {editing ? 'Save' : 'Create'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
