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

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label={tForm('name')}>
              <Input value={me.displayName} readOnly disabled />
            </Field>
            <Field label={tForm('email')}>
              <Input value={me.email} readOnly disabled />
            </Field>
          </div>

          <Field id="rq-link" label={tForm('assetLink')} helper={tForm('assetLinkHelper')} required error={form.formState.errors.assetLink?.message}>
            <Input id="rq-link" type="url" {...form.register('assetLink')} placeholder="https://" />
          </Field>

          <Field id="rq-type" label={tForm('assetType')} helper={tForm('assetTypeHelper')} required error={form.formState.errors.assetType?.message}>
            <Input id="rq-type" {...form.register('assetType')} />
          </Field>

          <Field id="rq-use" label={tForm('intendedUse')} helper={tForm('intendedUseHelper')} required error={form.formState.errors.intendedUse?.message}>
            <Textarea id="rq-use" rows={4} {...form.register('intendedUse')} />
          </Field>

          <div className="grid sm:grid-cols-[1fr_120px] gap-3">
            <Field id="rq-price" label={tForm('price')}>
              <Input id="rq-price" type="number" min={0} step="0.01" {...form.register('price')} placeholder="0.00" inputMode="decimal" />
            </Field>
            <Field id="rq-cur" label={tForm('currency')}>
              <Input id="rq-cur" value="USD" readOnly disabled />
            </Field>
          </div>

          <Field id="rq-notes" label={tForm('notes')} helper={tForm('notesHelper')}>
            <Textarea id="rq-notes" rows={3} {...form.register('notes')} />
          </Field>

          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {t('submit')}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
