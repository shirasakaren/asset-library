'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { useAuthedFetch } from '@/lib/api/client';
import { toast } from '@/components/ui/toaster';
import type { AdminAssetRow } from '@/lib/api/admin-types';

interface Props {
  asset: AdminAssetRow;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function AdminForceDeleteModal({ asset, onOpenChange, onDone }: Props) {
  const fetcher = useAuthedFetch();
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const ready = confirmText === asset.title && reason.trim().length >= 10;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      await fetcher(`/admin/assets/${asset.id}/force-delete`, {
        method: 'POST',
        body: {
          reason: reason.trim(),
          confirm: 'I understand',
          confirmedAt: new Date().toISOString(),
        },
      });
      toast.success(`Force-deleted ${asset.title}`);
      onDone();
    } catch (err) {
      toast.error('Could not force-delete', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>Force-delete this asset?</ModalTitle>
          <ModalDescription>
            This immediately removes the asset, all files in S3, and all history. This cannot be undone.
          </ModalDescription>
        </ModalHeader>

        <Alert variant="danger" icon={<ShieldAlert className="h-5 w-5 text-brand-red" strokeWidth={2.25} />}>
          {asset.ownerDisplayName} will lose every file associated with this asset.
        </Alert>

        <div className="space-y-4 mt-4">
          <Field
            id="fd-confirm"
            label="Type the asset title to confirm"
            error={confirmText && confirmText !== asset.title ? 'Title does not match.' : undefined}
          >
            <Input
              id="fd-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
