'use client';

import { useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { Field, Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { useAuthedFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { toast } from '@/components/ui/toaster';
import type { AdminUser } from '@/lib/api/admin-types';

interface Props {
  user: AdminUser;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function DemoteAdminModal({ user, onOpenChange, onDone }: Props) {
  const fetcher = useAuthedFetch();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastAdminError, setLastAdminError] = useState(false);

  const submit = async () => {
    if (confirm !== user.email) return;
    setBusy(true);
    setLastAdminError(false);
    try {
      await fetcher(`/admin/users/${user.id}/demote`, {
        method: 'POST',
        body: { confirm: 'I understand', confirmedAt: new Date().toISOString() },
      });
      toast.success(`${user.displayName} demoted to user`);
      onDone();
    } catch (err) {
      if (ApiError.isApiError(err) && err.code === 'admin.cannot_remove_last_admin') {
        setLastAdminError(true);
        return;
      }
      toast.error('Demotion failed', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>Demote {user.displayName}?</ModalTitle>
        </ModalHeader>
        {lastAdminError ? (
          <Alert variant="danger" className="mb-3">
            Cannot demote the last remaining admin.
          </Alert>
        ) : null}
        <Field id="dm-confirm" label="Type their email to confirm" required>
          <Input id="dm-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={user.email} />
        </Field>
        <ModalFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={confirm !== user.email}
            onClick={submit}
          >
            Demote
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
