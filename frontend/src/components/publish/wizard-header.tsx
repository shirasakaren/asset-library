'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { useWizard, isChecklistReady } from './wizard-context';
import { useAuthedFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { toast } from '@/components/ui/toaster';
import { formatRelative } from '@/lib/format';
import { logEvent } from '@/lib/logger.events';
import type { LocaleCode } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface WizardHeaderProps {
  variant?: 'edit' | 'new-version';
}

export function WizardHeader({ variant = 'edit' }: WizardHeaderProps) {
  const wiz = useWizard();
  const fetcher = useAuthedFetch();
  const router = useRouter();
  const t = useTranslations('publish');
  const locale = useLocale() as LocaleCode;
  const [publishing, setPublishing] = useState(false);

  const ready = isChecklistReady(wiz.checklist, wiz.asset.engine);
  // Editing an already-published asset re-runs the same publish endpoint but
  // the action reads as an "Update" to the user.
  const isPublished = wiz.asset.status === 'PUBLISHED';

  const handleExit = async () => {
    await wiz.flush();
    router.push('/publish');
  };

  const handlePublish = async () => {
    if (publishing || !ready) return;
    await wiz.flush();
    setPublishing(true);
    logEvent('publish.publish_clicked', { assetId: wiz.asset.id });
    try {
      await fetcher(`/assets/${wiz.asset.id}/publish`, {
        method: 'POST',
        body: {},
      });
      toast.success(isPublished ? t('updatedToast') : t('publishedToast'));
      router.push(`/assets/${wiz.asset.slug || wiz.asset.id}`);
    } catch (err) {
      if (ApiError.isApiError(err) && err.code === 'asset.publish_blocked' && err.fields) {
        toast.error(t('publishBlocked'));
        const firstField = err.fields[0]?.path;
        if (firstField?.startsWith('thumbnail') || firstField?.startsWith('thumb')) {
          wiz.setStep('media');
        } else if (firstField?.startsWith('files') || firstField?.startsWith('version.files')) {
          wiz.setStep('files');
        } else if (firstField?.startsWith('compatibility')) {
          wiz.setStep('compatibility');
        } else if (firstField?.startsWith('license')) {
          wiz.setStep('license');
        }
      } else {
        toast.error(t('saveFailed'));
      }
    } finally {
      setPublishing(false);
    }
  };

  return (
    <header className="border-b border-line bg-bg/85 backdrop-blur-[8px] sticky top-16 z-30">
      <div className="px-6 lg:px-10 py-4">
        <Breadcrumbs
          items={[
            { label: 'Publish', href: '/publish' },
            { label: wiz.asset.title || 'Untitled' },
          ]}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <StatusPill status={wiz.asset.status} />
              <SaveIndicator
                saving={wiz.saving}
                lastSavedAt={wiz.lastSavedAt}
                locale={locale}
              />
            </div>
            <h1 className="font-display text-h1 text-ink tracking-[-0.015em] truncate max-w-[60vw]">
              {wiz.asset.title || 'Untitled asset'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleExit}>
              {t('exit')}
            </Button>
            <Button
              size="lg"
              onClick={handlePublish}
              disabled={!ready || publishing || variant === 'new-version'}
              loading={publishing}
              title={ready ? undefined : t('publishBlocked')}
            >
              {publishing
                ? isPublished
                  ? t('updatingCta')
                  : t('publishingCta')
                : isPublished
                  ? t('updateCta')
                  : t('publishCta')}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}

function StatusPill({ status }: { status: string }) {
  const variant =
    status === 'PUBLISHED'
      ? 'success'
      : status === 'DRAFT'
        ? 'warning'
        : status === 'ARCHIVED'
          ? 'neutral'
          : 'danger';
  return (
    <Badge variant={variant as 'success'}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

function SaveIndicator({
  saving,
  lastSavedAt,
  locale,
}: {
  saving: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt: number | null;
  locale: LocaleCode;
}) {
  if (saving === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-caption text-ink-3">
        <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.25} />
        Saving…
      </span>
    );
  }
  if (saving === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 text-caption text-brand-red">
        <AlertTriangle className="h-3 w-3" strokeWidth={2.25} />
        Could not save
      </span>
    );
  }
  if (lastSavedAt) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-caption text-ink-3')}>
        <CheckCircle2 className="h-3 w-3 text-brand-green" strokeWidth={2.25} />
        {formatRelative(lastSavedAt, locale)}
      </span>
    );
  }
  return null;
}
