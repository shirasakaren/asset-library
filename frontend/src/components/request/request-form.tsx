'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
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
import { Field, Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { toast } from '@/components/ui/toaster';
import { useAuthedFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { logEvent } from '@/lib/logger.events';
import type { MeResponse } from '@/lib/api/types';

const Schema = z.object({
  assetLink: z.string().url(),
  assetType: z.string().min(2).max(80),
  intendedUse: z.string().min(20).max(2000),
  price: z.string().optional(),
  notes: z.string().max(2000).optional(),
});
type FormValues = z.infer<typeof Schema>;

interface Props {
  me: MeResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function RequestForm({ me, open, onOpenChange, onCreated }: Props) {
  const t = useTranslations('request');
  const tForm = useTranslations('request.form');
  const tCommon = useTranslations('common');
  const fetcher = useAuthedFetch();
  const [rateLimited, setRateLimited] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { assetLink: '', assetType: '', intendedUse: '', price: '', notes: '' },
  });

  const onSubmit = async (values: FormValues) => {
    logEvent('request.submit');
    try {
      await fetcher('/asset-requests', {
        method: 'POST',
        body: {
          assetLink: values.assetLink,
          assetType: values.assetType,
          intendedUse: values.intendedUse,
          price: values.price ? Number(values.price) : undefined,
          notes: values.notes || undefined,
        },
      });
      toast.success(t('submitted'));
      onCreated();
    } catch (err) {
      if (ApiError.isApiError(err) && err.status === 429) {
        setRateLimited(true);
        return;
      }
      toast.error('Could not submit', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>{t('newRequest')}</ModalTitle>
          <ModalDescription>{t('subtitle')}</ModalDescription>
        </ModalHeader>

        {rateLimited ? <Alert variant="warning" className="mb-4">{t('rateLimited')}</Alert> : null}
