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
import { Field, Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { useAuthedFetch } from '@/lib/api/client';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { toast } from '@/components/ui/toaster';
import { avatarFromServer, getAvatarTokens } from '@/lib/avatar';
import type { AdminUser, AdminUserPage } from '@/lib/api/admin-types';

interface Props {
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function PromoteAdminModal({ onOpenChange, onDone }: Props) {
  const fetcher = useAuthedFetch();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 200);
  const [picked, setPicked] = useState<AdminUser | null>(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const candidates = useQuery({
    queryKey: ['admin', 'promote-search', debounced],
    queryFn: () =>
      fetcher<AdminUserPage>('/admin/users', { query: { q: debounced, limit: 8 } }),
    enabled: debounced.length > 1,
    staleTime: 30_000,
  });

  const submit = async () => {
    if (!picked || confirm !== picked.email) return;
    setBusy(true);
    try {
      await fetcher(`/admin/users/${picked.id}/promote`, {
        method: 'POST',
        body: { confirm: 'I understand', confirmedAt: new Date().toISOString() },
      });
      toast.success(`${picked.displayName} promoted to admin`);
      onDone();
    } catch (err) {
      toast.error('Promotion failed', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>Promote a user to admin</ModalTitle>
          <ModalDescription>
            Admins have full operational access. Pick from the list below; type their email to confirm.
          </ModalDescription>
        </ModalHeader>
        {!picked ? (
          <Field label="Find a user">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" />
            {candidates.data?.items && candidates.data.items.length > 0 ? (
              <ul className="mt-2 max-h-[200px] overflow-y-auto rounded-[12px] border border-line bg-surface">
                {candidates.data.items
                  .filter((u) => !u.isAdmin)
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
                              : getAvatarTokens({ id: u.id, displayName: u.displayName, email: u.email })
                          }
                          size={32}
                        />
                        <span className="block">
                          <span className="text-[13.5px] font-medium text-ink">{u.displayName}</span>
                          <span className="block text-caption text-ink-3 font-mono">{u.email}</span>
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            ) : null}
          </Field>
        ) : (
          <div className="space-y-3">
            <div className="inline-flex items-center gap-3 p-3 rounded-[12px] border border-line bg-surface-muted/60">
              <Avatar
                data={
                  picked.avatar
                    ? avatarFromServer(picked.avatar)
                    : getAvatarTokens({ id: picked.id, displayName: picked.displayName, email: picked.email })
                }
                size={32}
              />
              <span>
                <span className="text-[14px] font-semibold text-ink">{picked.displayName}</span>
                <span className="block text-caption text-ink-3 font-mono">{picked.email}</span>
              </span>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setPicked(null)}>
                Change
              </Button>
            </div>
            <Field id="pm-confirm" label="Type their email to confirm" required>
              <Input
                id="pm-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={picked.email}
              />
            </Field>
          </div>
        )}
        <ModalFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={busy}
            disabled={!picked || confirm !== picked.email}
          >
            Promote
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
