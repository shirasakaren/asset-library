'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthedFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { logEvent } from '@/lib/logger.events';
import { logger } from '@/lib/logger';
import { useTranslations } from 'next-intl';
import { useUploadStore, selectCompletedFileIdsFor } from '@/lib/upload/upload-store';
import type { AssetDetail, AssetVersionPayload, LocaleCode } from '@/lib/api/types';

export type WizardStep =
  | 'basics'
  | 'media'
  | 'files'
  | 'description'
  | 'compatibility'
  | 'tags'
  | 'license'
  | 'review';

export const WIZARD_STEPS: WizardStep[] = [
  'basics',
  'media',
  'files',
  'description',
  'compatibility',
  'tags',
  'license',
  'review',
];

interface PendingPatch {
  [field: string]: unknown;
}

interface WizardCtxValue {
  asset: AssetDetail;
  latestVersion: AssetVersionPayload | null;
  step: WizardStep;
  setStep: (step: WizardStep) => void;
  /** Queue a debounced PATCH. The wizard coalesces calls within 800 ms. */
  patch: (delta: PendingPatch) => void;
  /** Force-flush any pending patch (e.g. before exiting). */
  flush: () => Promise<void>;
  saving: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt: number | null;
  dirty: boolean;
  /** Live checklist; the rail re-renders from this. */
  checklist: ChecklistState;
  /** Reload the asset detail (after, e.g., an upload finishes). */
  refresh: () => Promise<void>;
}

export interface ChecklistState {
  thumbnail: ChecklistItem;
  files: ChecklistItem;
  license: ChecklistItem;
  category: ChecklistItem;
  semver: ChecklistItem;
  description: ChecklistItem;
  compatibility: ChecklistItem;
}

export type ChecklistItem = { status: 'pending' | 'in-progress' | 'done'; label: string };

const WizardContext = createContext<WizardCtxValue | null>(null);

export function useWizard() {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error('useWizard must be used inside <WizardProvider>');
  return ctx;
}

interface WizardProviderProps {
  initialAsset: AssetDetail;
  locale: LocaleCode;
  children: ReactNode;
}

export function WizardProvider({ initialAsset, locale, children }: WizardProviderProps) {
  const fetcher = useAuthedFetch();
  const queryClient = useQueryClient();
  const t = useTranslations('publish.checklist');
  const [step, setStep] = useState<WizardStep>('basics');
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  const queueRef = useRef<PendingPatch>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const assetQuery = useQuery({
    queryKey: queryKeys.asset(initialAsset.id, locale),
    queryFn: () =>
      fetcher<AssetDetail>(`/assets/${initialAsset.id}`, {
        query: { locale },
      }),
    initialData: initialAsset,
    refetchOnWindowFocus: false,
    // While inside the wizard we never want a stale-cache flash that
    // overwrites the user's optimistic edits.
    staleTime: 60_000,
  });
  const asset = assetQuery.data ?? initialAsset;
  const latestVersion = useMemo(
    () => asset.versions.find((v) => v.isLatest) ?? asset.versions[0] ?? null,
    [asset.versions],
  );

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const payload = queueRef.current;
    if (Object.keys(payload).length === 0) return;
    queueRef.current = {};
    setSaving('saving');
    inflight.current = (async () => {
      try {
        await fetcher(`/assets/${asset.id}`, {
          method: 'PATCH',
          body: payload,
        });
        setSaving('saved');
        setLastSavedAt(Date.now());
        setDirty(false);
        logEvent('publish.autosave', { assetId: asset.id, keys: Object.keys(payload) });
        // Re-read the asset so analyzer-driven fields refresh.
        await queryClient.invalidateQueries({ queryKey: queryKeys.asset(asset.id, locale) });
      } catch (err) {
        logger.warn('publish.autosave-failed', {
          err: err instanceof Error ? err.message : String(err),
        });
        // Re-queue so a manual retry / next change re-attempts.
        queueRef.current = { ...payload, ...queueRef.current };
        setSaving('error');
      } finally {
        inflight.current = null;
      }
    })();
    await inflight.current;
  }, [asset.id, fetcher, queryClient, locale]);

  const patch = useCallback(
    (delta: PendingPatch) => {
      queueRef.current = { ...queueRef.current, ...delta };
      setDirty(true);
      setSaving('saving');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flush();
      }, 800);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  // beforeunload guard for dirty state.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirty || saving === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, saving]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.asset(asset.id, locale) });
  }, [queryClient, asset.id, locale]);

  // Background uploads live in a global store decoupled from the wizard. Watch
  // it: when a file finishes uploading (its AssetFile row is finalized and the
  // version recounted server-side), re-read the asset so latestVersion.fileCount
  // refreshes and the "at least 1 file uploaded" checklist item ticks live —
  // without the user reloading. Select stable refs and derive the signature in
  // render (a selector returning a fresh array each call triggers React #185).
  const uploadTasks = useUploadStore((s) => s.tasks);
  const uploadOrder = useUploadStore((s) => s.order);
  const completedUploadSig = useMemo(
    () =>
      selectCompletedFileIdsFor(
        { tasks: uploadTasks, order: uploadOrder },
        asset.id,
        latestVersion?.id ?? '',
      )
        .sort()
        .join(','),
    [uploadTasks, uploadOrder, asset.id, latestVersion?.id],
  );
  const seenUploadSig = useRef(completedUploadSig);
  useEffect(() => {
    if (completedUploadSig === seenUploadSig.current) return;
    seenUploadSig.current = completedUploadSig;
    if (completedUploadSig) void refresh();
  }, [completedUploadSig, refresh]);

  const checklist: ChecklistState = useMemo(() => {
    const hasThumb = Boolean(asset.thumbnail.url || asset.thumbnailAutoGenerated?.url);
    const hasFiles = (latestVersion?.fileCount ?? 0) > 0;
    const semverOk = /^\d+\.\d+\.\d+$/.test(latestVersion?.semver ?? '');
    const hasDescription = Boolean(asset.longDescription || asset.availableLocales.length > 0);
    const compatibilityNeeded = asset.engine !== 'ENGINE_AGNOSTIC';
    const compatibilitySet =
      !compatibilityNeeded || (latestVersion?.compatibility?.length ?? 0) > 0;
    return {
      thumbnail: { status: hasThumb ? 'done' : 'pending', label: t('thumbnail') },
      files: { status: hasFiles ? 'done' : 'pending', label: t('atLeastOneFile') },
      license: { status: asset.license?.id ? 'done' : 'pending', label: t('licenseSet') },
      category: { status: asset.category?.id ? 'done' : 'pending', label: t('categorySet') },
      semver: { status: semverOk ? 'done' : 'pending', label: t('semverValid') },
      description: {
        status: hasDescription ? 'done' : 'pending',
        label: t('descriptionTranslation'),
      },
      compatibility: {
        status: compatibilitySet ? 'done' : 'pending',
        label: t('compatibilitySet'),
      },
    };
  }, [asset, latestVersion, t]);

  const value: WizardCtxValue = {
    asset,
    latestVersion,
    step,
    setStep,
    patch,
    flush,
    saving,
    lastSavedAt,
    dirty,
    checklist,
    refresh,
  };

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

export function isChecklistReady(
  c: ChecklistState,
  engine: import('@/lib/api/types').Engine,
): boolean {
  // The analyzer runs async after publish; it's informational on the detail
  // page and no longer gates the Publish button.
  const items = [c.thumbnail, c.files, c.license, c.category, c.semver, c.description];
  if (engine !== 'ENGINE_AGNOSTIC') items.push(c.compatibility);
  return items.every((i) => i.status === 'done');
}
