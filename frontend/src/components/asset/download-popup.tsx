'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  Package,
  FileBox,
  Image as ImageIcon,
  FileCode,
  Music,
  Video,
  Archive,
  Loader2,
  CheckCircle2,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { VersionBadge } from './version-badge';
import { useAuthedFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/queries';
import { formatBytes } from '@/lib/format';
import { logEvent } from '@/lib/logger.events';
import { cn } from '@/lib/utils';
import type {
  DownloadOptions,
  DownloadOptionsFile,
  DownloadSource,
  LocaleCode,
  VersionSummary,
} from '@/lib/api/types';
import { useLocale } from 'next-intl';

interface DownloadPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string;
  assetTitle: string;
  /**
   * A real version id (UUID) or the sentinel `'latest'`. When `'latest'`,
   * the popup looks up the asset's published versions via
   * `GET /assets/:assetId/versions` and resolves the entry with
   * `isLatest === true` before requesting download options. This keeps the
   * Library row "quick download" trigger one-shot from `AssetSummary`
   * (which doesn't carry a latestVersionId).
   */
  initialVersionId: string;
}

const LATEST_SENTINEL = 'latest';

type State =
  | { step: 'browse' }
  | { step: 'downloading'; fileId: string }
  | { step: 'thank-you'; url: string }
  | { step: 'error'; message: string };

const kindIcon = (kind: string) => {
  const k = kind.toUpperCase();
  if (k.includes('UNITY') || k.includes('UPLUGIN')) return Package;
  if (k.includes('GLB') || k.includes('FBX') || k.includes('OBJ') || k === 'PREFAB' || k === 'SCENE') return FileBox;
  if (k.includes('TEXTURE') || k === 'SPRITE' || k.includes('IMAGE') || k.includes('NORMAL')) return ImageIcon;
  if (k.includes('AUDIO')) return Music;
  if (k.includes('VIDEO')) return Video;
  if (k.includes('SCRIPT') || k.includes('SHADER') || k.includes('MATERIAL')) return FileCode;
  if (k.includes('ARCHIVE')) return Archive;
  return Package;
};

const friendlyKind = (kind: string) => kind.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export function DownloadPopup({
  open,
  onOpenChange,
  assetId,
  assetTitle,
  initialVersionId,
}: DownloadPopupProps) {
  const t = useTranslations('download');
  const tCommon = useTranslations('common');
  const locale = useLocale() as LocaleCode;
  const fetcher = useAuthedFetch();
  const queryClient = useQueryClient();
  const [versionId, setVersionId] = useState(initialVersionId);
  const [showOlder, setShowOlder] = useState(false);
  const [state, setState] = useState<State>({ step: 'browse' });

  useEffect(() => {
    if (open) {
      setVersionId(initialVersionId);
      setState({ step: 'browse' });
      setShowOlder(false);
    }
  }, [open, initialVersionId]);

  // When opened with the 'latest' sentinel we need to resolve the real
  // version id before hitting /downloads/options. Lighter than fetching
  // the full asset detail.
  const needsLatestLookup = open && versionId === LATEST_SENTINEL;
  const versionsQuery = useQuery({
    queryKey: queryKeys.assetVersions(assetId),
    queryFn: () => fetcher<VersionSummary[]>(`/assets/${assetId}/versions`),
    enabled: needsLatestLookup,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!needsLatestLookup || !versionsQuery.data) return;
    const latest =
      versionsQuery.data.find((v) => v.isLatest && v.publishedAt) ??
      versionsQuery.data.find((v) => v.publishedAt) ??
      versionsQuery.data[0];
    if (latest) setVersionId(latest.id);
  }, [needsLatestLookup, versionsQuery.data]);

  const versionIdResolved = versionId !== LATEST_SENTINEL ? versionId : '';

  const options = useQuery({
    queryKey: queryKeys.downloadOptions(assetId, versionIdResolved),
    queryFn: () =>
      fetcher<DownloadOptions>(`/downloads/options`, {
        query: { assetId, versionId: versionIdResolved },
      }),
    enabled: open && Boolean(versionIdResolved),
    staleTime: 0,
  });

  const filesGrouped = useMemo(() => {
    const groups = new Map<string, DownloadOptionsFile[]>();
    for (const f of options.data?.files ?? []) {
      const k = friendlyKind(f.kind);
      const bucket = groups.get(k) ?? [];
      bucket.push(f);
      groups.set(k, bucket);
    }
    return Array.from(groups.entries());
  }, [options.data]);

  const handlePick = async (file: DownloadOptionsFile) => {
    if (!versionIdResolved) return;
    setState({ step: 'downloading', fileId: file.id });
    logEvent('asset.download_click', { assetId, versionId: versionIdResolved, fileId: file.id });
    try {
      const response = await fetcher<DownloadOptions>('/downloads', {
        method: 'POST',
        body: {
          assetId,
          versionId: versionIdResolved,
          fileId: file.id,
          source: 'WEB' satisfies DownloadSource,
        },
        locale,
      });
      const url = response.files.find((f) => f.id === file.id)?.getUrl;
      if (url) {
        window.location.href = url;
        setState({ step: 'thank-you', url });
      } else {
        setState({ step: 'error', message: t('failedBody') });
      }
      // The backend auto-saves to the user's library on first download.
      queryClient.invalidateQueries({ queryKey: queryKeys.libraryAll });
    } catch (err) {
      const message =
        ApiError.isApiError(err) && err.code === 'av.infected'
          ? t('failedBody')
          : t('failedBody');
      setState({ step: 'error', message });
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>{t('title', { asset: assetTitle })}</ModalTitle>
          {options.data ? (
            <div className="mt-2 flex items-center gap-2">
              <VersionBadge
                semver={options.data.version.semver}
                isLatest={
                  versionIdResolved ===
                  (versionsQuery.data?.find((v) => v.isLatest)?.id ??
                    (initialVersionId === LATEST_SENTINEL ? versionIdResolved : initialVersionId))
                }
              />
            </div>
          ) : null}
          <ModalDescription>{t('subtitle')}</ModalDescription>
        </ModalHeader>

        <AnimatePresence mode="wait" initial={false}>
          {state.step === 'thank-you' ? (
            <motion.div
              key="thanks"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="py-8 text-center"
            >
              <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-green-50 text-brand-green">
                <CheckCircle2 className="h-7 w-7" strokeWidth={2.25} />
              </div>
              <h3 className="font-display text-h2 text-ink tracking-[-0.01em]">{t('thankYouTitle')}</h3>
              <p className="mt-2 text-body-sm text-ink-2">
                {t.rich('thankYouBody', {
                  link: (chunks) => (
                    <a className="link-inline" href={state.url}>
                      {t('thankYouLink')}
                      <span className="sr-only">{chunks}</span>
                    </a>
                  ),
                })}
              </p>
              <div className="mt-6 flex items-center justify-center gap-2">
                <Button variant="secondary" onClick={() => setState({ step: 'browse' })}>
                  {t('downloadAnother')}
                </Button>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  {tCommon('close')}
                </Button>
              </div>
            </motion.div>
          ) : state.step === 'error' ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Alert variant="danger" title={t('failedTitle')} icon={<AlertTriangle className="h-5 w-5 text-brand-red" strokeWidth={2.25} />}>
                {state.message}
              </Alert>
              <div className="mt-5 flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  {tCommon('close')}
                </Button>
                <Button onClick={() => setState({ step: 'browse' })}>{tCommon('tryAgain')}</Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="browse"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {versionsQuery.isPending && needsLatestLookup ? (
                <div className="py-10 text-center text-ink-3 inline-flex items-center justify-center w-full gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
                  {tCommon('loading')}
                </div>
              ) : versionsQuery.isError && needsLatestLookup ? (
                <Alert variant="danger" title={t('failedTitle')}>
                  {t('failedBody')}
                </Alert>
              ) : options.isPending ? (
                <div className="py-10 text-center text-ink-3 inline-flex items-center justify-center w-full gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
                  {tCommon('loading')}
                </div>
              ) : options.isError ? (
                <Alert variant="danger" title={t('failedTitle')}>
                  {t('failedBody')}
                </Alert>
              ) : !options.data || options.data.files.length === 0 ? (
                <p className="py-8 text-center text-body-sm text-ink-3">{t('noFiles')}</p>
              ) : (
                <div className="space-y-5">
                  {filesGrouped.map(([groupName, files]) => (
                    <div key={groupName}>
                      <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 mb-2">
                        {groupName}
                      </p>
                      <ul className="flex flex-col gap-1.5">
                        {files.map((file) => {
                          const Icon = kindIcon(file.kind);
                          const downloading = state.step === 'downloading' && state.fileId === file.id;
                          const disabled = state.step === 'downloading';
                          return (
                            <li key={file.id}>
                              <button
                                type="button"
                                onClick={() => handlePick(file)}
                                disabled={disabled}
                                className={cn(
                                  'group w-full flex items-center gap-4 p-3 rounded-[14px] border border-line bg-surface text-left',
                                  'hover:border-ink/30 hover:bg-surface-muted/40 transition-colors duration-120',
                                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
                                  disabled && !downloading && 'opacity-60 cursor-not-allowed',
                                )}
                              >
                                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-surface-muted text-ink-2 shrink-0">
                                  <Icon className="h-4 w-4" strokeWidth={2.25} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[14px] font-medium text-ink truncate">
                                    {file.relativePath}
                                  </span>
                                  <span className="block text-caption text-ink-3 geist-tnum">
                                    {formatBytes(file.bytes, locale)} · {friendlyKind(file.kind)}
                                  </span>
                                </span>
                                {downloading ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-ink-2" strokeWidth={2.25} />
                                ) : (
                                  <Download className="h-4 w-4 text-ink-3 group-hover:text-ink transition-colors duration-120" strokeWidth={2.25} />
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}

                  {options.data.olderVersions.length > 0 ? (
                    <div className="pt-3 border-t border-line">
                      <button
                        type="button"
                        onClick={() => setShowOlder((s) => !s)}
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink transition-colors duration-120"
                      >
                        <ChevronDown
                          className={cn('h-3.5 w-3.5 transition-transform duration-200', showOlder && 'rotate-180')}
                          strokeWidth={2.25}
                        />
                        {showOlder ? t('hideOlderVersions') : t('showOlderVersions')}
                      </button>
                      {showOlder ? (
                        <ul className="mt-3 flex flex-col gap-1.5">
                          {options.data.olderVersions.map((v) => (
                            <li key={v.id}>
                              <button
                                type="button"
                                onClick={() => setVersionId(v.id)}
                                className={cn(
                                  'w-full flex items-center justify-between p-2.5 rounded-[10px] border border-line text-left text-[13.5px]',
                                  'hover:bg-surface-muted/60 transition-colors duration-120',
                                )}
                              >
                                <VersionBadge semver={v.semver} size="sm" />
                                <span className="text-caption text-ink-3 geist-tnum">
                                  {v.publishedAt
                                    ? new Date(v.publishedAt).toLocaleDateString(
                                        locale === 'id' ? 'id-ID' : 'en-US',
                                        { dateStyle: 'medium' },
                                      )
                                    : '—'}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </ModalContent>
    </Modal>
  );
}
