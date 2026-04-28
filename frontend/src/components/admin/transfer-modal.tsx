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
          <ul className="mt-2 max-h-[200px] overflow-y-auto rounded-[12px] border border-line bg-surface">
            {users.data.items
              .filter((u) => u.id !== asset.ownerId)
              .map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(u)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-muted/60 transition-colors"
                  >
                    <Avatar
                      data={
                        u.avatar
                          ? avatarFromServer(u.avatar)
                          : { initials: u.displayName.slice(0, 2).toUpperCase(), bgColor: '#3a6dc5', fgColor: '#fff' }
                      }
                      size={24}
                    />
                    <span className="text-[14px] font-medium text-ink">{u.displayName}</span>
                    <span className="text-caption text-ink-3 font-mono ml-auto">{u.email}</span>
                  </button>
                </li>
              ))}
          </ul>
        ) : null}

        {picked ? (
          <div className="mt-3 flex items-center justify-between p-3 rounded-[12px] bg-surface-muted/50 border border-line">
            <span className="inline-flex items-center gap-2">
              <Avatar
                data={
                  picked.avatar
                    ? avatarFromServer(picked.avatar)
                    : { initials: picked.displayName.slice(0, 2).toUpperCase(), bgColor: '#3a6dc5', fgColor: '#fff' }
                }
                size={32}
              />
              <span className="text-[14px] font-semibold text-ink">{picked.displayName}</span>
              <span className="text-caption text-ink-3 font-mono">{picked.email}</span>
              {picked.isAdmin ? (
                <span className="text-[10px] font-semibold text-brand-blue bg-brand-blue-50 px-1.5 rounded-full">
                  ADMIN
                </span>
              ) : null}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
              Change
            </Button>
          </div>
        ) : null}

        <Field id="t-confirm" label="Type the asset title to confirm" className="mt-4">
          <Input
            id="t-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={asset.title}
          />
        </Field>

        <ModalFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!ready} loading={busy} onClick={submit}>
            Transfer
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
