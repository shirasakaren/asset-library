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
