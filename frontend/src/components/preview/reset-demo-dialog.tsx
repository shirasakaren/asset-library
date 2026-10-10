'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { resetDemo } from '@/preview';
import { goHomeWithReload } from '@/preview/navigate';
import { clearBannerDismissed } from '@/preview/banner-storage';
import { Button } from '@/components/ui/button';
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';
import { toast } from '@/components/ui/toaster';

/** Gives the success toast a moment on screen before the page reloads. */
const RELOAD_DELAY_MS = 600;

interface ResetDemoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Confirm dialog for "Reset demo data": wipes the visitor's overlay and uploaded blobs, drops the
 * client query cache, brings the preview banner back and reloads the home page. Opened from the
 * profile menu, the banner and the footer.
 */
export function ResetDemoDialog({ open, onOpenChange }: ResetDemoDialogProps) {
  const t = useTranslations('preview');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await resetDemo();
    } catch (err) {
      console.error('[preview] reset failed', err);
      toast.error(t('resetFailed'));
      setBusy(false);
      return;
    }
    queryClient.clear();
    clearBannerDismissed();
    toast.success(t('resetDone'));
    // Stay busy: the page is about to reload.
    setTimeout(goHomeWithReload, RELOAD_DELAY_MS);
  };

  return (
    <Modal open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>{t('resetConfirmTitle')}</ModalTitle>
          <ModalDescription>{t('resetConfirmBody')}</ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button loading={busy} onClick={() => void confirm()}>
            {t('resetConfirm')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
