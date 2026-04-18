'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Check, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { logEvent } from '@/lib/logger.events';

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetTitle: string;
  url: string;
}

export function ShareModal({ open, onOpenChange, assetTitle, url }: ShareModalProps) {
  const t = useTranslations('share');
  const tCommon = useTranslations('common');
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [nativeAvailable, setNativeAvailable] = useState(false);

  useEffect(() => {
    setNativeAvailable(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  useEffect(() => {
    if (open) setCopied(false);
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t('copied'));
      logEvent('asset.share_copy', { url });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      inputRef.current?.select();
    }
  };

  const native = async () => {
    if (typeof navigator === 'undefined' || !navigator.share) return;
    try {
      await navigator.share({ title: assetTitle, url });
      logEvent('asset.share_native', { url });
    } catch {
      /* user cancelled — fine */
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>{t('title')}</ModalTitle>
          <ModalDescription>{t('intro')}</ModalDescription>
        </ModalHeader>
        <div className="flex items-stretch gap-2">
          <input
            ref={inputRef}
            readOnly
            value={url}
            aria-label={assetTitle}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-0 h-11 px-3 rounded-[10px] border border-line bg-surface-muted text-[13.5px] font-mono text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          />
          <Button onClick={copy} leadingIcon={copied ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Copy className="h-4 w-4" strokeWidth={2.25} />}>
            {copied ? t('copied') : t('copy')}
          </Button>
        </div>
        <ModalFooter>
          {nativeAvailable ? (
            <Button
              variant="secondary"
              onClick={native}
              leadingIcon={<Share2 className="h-4 w-4" strokeWidth={2.25} />}
            >
              {t('native')}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tCommon('close')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
