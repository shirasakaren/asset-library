'use client';

import NextLink from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MoreVertical, Edit, ExternalLink, Plus, Archive, RefreshCcw, Trash2, BarChart3 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import { useAuthedFetch } from '@/lib/api/client';
import type { AssetSummary } from '@/lib/api/types';

interface ManageActionsProps {
  asset: AssetSummary;
  isAdmin: boolean;
}

export function ManageActions({ asset, isAdmin: _isAdmin }: ManageActionsProps) {
  const t = useTranslations('publish.manageView');
  const fetcher = useAuthedFetch();
  const router = useRouter();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [busy, setBusy] = useState(false);

  const doArchive = async () => {
    setBusy(true);
    try {
      await fetcher(`/assets/${asset.id}/archive`, { method: 'POST' });
      toast.success('Archived');
      setArchiveOpen(false);
      router.refresh();
    } catch (err) {
      toast.error('Could not archive', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    try {
      await fetcher(`/assets/${asset.id}/restore`, { method: 'POST' });
      toast.success('Restored');
      router.refresh();
    } catch (err) {
      toast.error('Could not restore', { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const doDelete = async () => {
    if (deleteText !== asset.title) return;
    setBusy(true);
    try {
      await fetcher(`/assets/${asset.id}`, { method: 'DELETE' });
      toast.success('Deleted');
      setDeleteOpen(false);
      router.refresh();
    } catch (err) {
      toast.error('Could not delete', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Actions"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-ink-2 hover:bg-surface-muted hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            <MoreVertical className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <NextLink href={`/publish/${asset.id}`}>
              <Edit className="h-3.5 w-3.5" strokeWidth={2.25} />
              Edit
            </NextLink>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <NextLink href={`/publish/${asset.id}/versions/new`}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
              {t('newVersion')}
            </NextLink>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <NextLink href={`/assets/${asset.slug || asset.id}`}>
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} />
              {t('viewPublic')}
            </NextLink>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <NextLink href={`/publish/manage/${asset.id}/analytics`}>
              <BarChart3 className="h-3.5 w-3.5" strokeWidth={2.25} />
              {t('analyticsLink')}
            </NextLink>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {asset.status === 'ARCHIVED' ? (
            <DropdownMenuItem onSelect={doRestore}>
              <RefreshCcw className="h-3.5 w-3.5" strokeWidth={2.25} />
              {t('restore')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setArchiveOpen(true)}>
              <Archive className="h-3.5 w-3.5" strokeWidth={2.25} />
              {t('archive')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem danger onSelect={() => setDeleteOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Modal open={archiveOpen} onOpenChange={setArchiveOpen}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>{t('archiveConfirmTitle')}</ModalTitle>
            <ModalDescription>{t('archiveConfirmBody')}</ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setArchiveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doArchive} loading={busy}>
              {t('archiveConfirm')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal open={deleteOpen} onOpenChange={setDeleteOpen}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>{t('deleteConfirmTitle')}</ModalTitle>
            <ModalDescription>{t('deleteConfirmBody')}</ModalDescription>
          </ModalHeader>
          <Field id="del-confirm" label={t('deleteConfirmInput')}>
            <Input
              id="del-confirm"
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder={asset.title}
            />
          </Field>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={doDelete}
              loading={busy}
              disabled={deleteText !== asset.title}
            >
              {t('deleteConfirm')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
