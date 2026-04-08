'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Field, Textarea } from '@/components/ui/input';
import { RadioGroup, Radio } from '@/components/ui/radio';
import { Alert } from '@/components/ui/alert';
import { toast } from '@/components/ui/toaster';
import { useAuthedFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { logEvent } from '@/lib/logger.events';
import { useState } from 'react';

const Schema = z.object({
  category: z.enum(['MALICIOUS_FILE', 'BROKEN_ASSET']),
  notes: z.string().min(10, 'Tell us a little more (10+ chars).').max(1000),
});
type FormValues = z.infer<typeof Schema>;

interface ReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string;
  assetTitle: string;
}

export function ReportModal({ open, onOpenChange, assetId, assetTitle }: ReportModalProps) {
  const t = useTranslations('report');
  const tCommon = useTranslations('common');
  const fetcher = useAuthedFetch();
  const [rateLimited, setRateLimited] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { category: 'BROKEN_ASSET', notes: '' },
  });

  useEffect(() => {
    if (open) {
      form.reset({ category: 'BROKEN_ASSET', notes: '' });
      setRateLimited(false);
    }
  }, [open, form]);

  const onSubmit = async (values: FormValues) => {
    logEvent('asset.report_submit', { assetId, category: values.category });
    try {
      await fetcher('/reports', {
        method: 'POST',
        body: { assetId, ...values },
      });
      toast.success(t('submitted'));
      onOpenChange(false);
    } catch (err) {
      if (ApiError.isApiError(err) && err.status === 429) {
        setRateLimited(true);
        return;
      }
      toast.error(t('intro'), { description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>{t('title')}</ModalTitle>
          <ModalDescription>
            <span className="font-medium text-ink">{assetTitle}</span>
            <br />
            {t('intro')}
          </ModalDescription>
        </ModalHeader>

        {rateLimited ? (
          <Alert variant="warning" className="mb-4">
