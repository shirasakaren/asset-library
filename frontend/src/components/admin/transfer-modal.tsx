'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { useAuthedFetch } from '@/lib/api/client';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { toast } from '@/components/ui/toaster';
import { Avatar } from '@/components/ui/avatar';
import { avatarFromServer } from '@/lib/avatar';
import type { AdminAssetRow, AdminUser, AdminUserPage } from '@/lib/api/admin-types';

interface Props {
  asset: AdminAssetRow;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function AdminTransferModal({ asset, onOpenChange, onDone }: Props) {
  const fetcher = useAuthedFetch();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<AdminUser | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const debounced = useDebouncedValue(query, 200);

  const users = useQuery({
    queryKey: ['admin', 'users-search', debounced],
    queryFn: () => fetcher<AdminUserPage>('/admin/users', { query: { q: debounced, limit: 8 } }),
    enabled: debounced.length > 1,
    staleTime: 30_000,
  });

  const ready = picked && confirmText === asset.title;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      await fetcher(`/admin/assets/${asset.id}/transfer`, {
        method: 'POST',
        body: {
          newOwnerId: picked.id,
          confirm: 'I understand',
          confirmedAt: new Date().toISOString(),
        },
      });
      toast.success(`Transferred to ${picked.displayName}`);
      onDone();
    } catch (err) {
      toast.error('Transfer failed', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>Transfer ownership</ModalTitle>
          <ModalDescription>
            Move <span className="font-medium text-ink">{asset.title}</span> to a different owner.
            Audit-logged.
          </ModalDescription>
        </ModalHeader>

        <Field id="t-search" label="Search for new owner">
          <Input
            id="t-search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
            }}
            placeholder="name or email"
          />
        </Field>

        {!picked && users.data?.items && users.data.items.length > 0 ? (
