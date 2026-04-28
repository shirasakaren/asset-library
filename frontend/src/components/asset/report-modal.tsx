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
            {t('rateLimited')}
          </Alert>
        ) : null}

        <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <Field
            label={t('categoryLabel')}
            error={form.formState.errors.category?.message as string | undefined}
          >
            <RadioGroup
              value={form.watch('category')}
              onValueChange={(v) => form.setValue('category', v as FormValues['category'])}
              className="grid sm:grid-cols-2 gap-2"
            >
              {(
                [
                  { value: 'MALICIOUS_FILE', label: t('categoryMalicious') },
                  { value: 'BROKEN_ASSET', label: t('categoryBroken') },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2.5 p-3 rounded-[12px] border border-line cursor-pointer hover:border-ink/40 transition-colors duration-120 has-[:checked]:border-ink has-[:checked]:bg-surface-muted/60"
                >
                  <Radio value={opt.value} />
                  <span className="text-[14px] font-medium text-ink">{opt.label}</span>
                </label>
              ))}
            </RadioGroup>
          </Field>
          <Field
            label={t('notesLabel')}
            error={form.formState.errors.notes?.message as string | undefined}
          >
            <Textarea
              rows={5}
              placeholder={t('notesPlaceholder')}
              invalid={!!form.formState.errors.notes}
              {...form.register('notes')}
            />
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
