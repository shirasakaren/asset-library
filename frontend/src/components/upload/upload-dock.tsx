'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSession } from 'next-auth/react';
import { useLocale } from 'next-intl';
import { ChevronUp, ChevronDown, X, Loader2, Check, AlertCircle, FileBox } from 'lucide-react';
import { useUploadStore } from '@/lib/upload/upload-store';
import type { LocaleCode } from '@/lib/api/types';
import type { UploadTask } from '@/lib/upload/types';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';

const ACTIVE = new Set(['queued', 'uploading']);

/**
 * Pushes the live access token into the global upload store and renders the
 * floating progress dock (bottom-right) whenever uploads are in flight and the
 * user is NOT currently on that asset's publish page (where the inline view
 * already shows progress).
 */
export function UploadDock() {
  const locale = useLocale() as LocaleCode;
  const setAuthProvider = useUploadStore((s) => s.setAuthProvider);
  // Select the two stable refs separately so Zustand's identity check sees a
  // stable subscription when nothing changed. A `.map().filter()` *inside*
  // the selector returned a new array every render → React error #185
  // ("Maximum update depth exceeded") → /(app)/ pages crashed into
  // error.tsx ("We hit a snag"). Derive the list after the selectors.
  const tasksMap = useUploadStore((s) => s.tasks);
  const order = useUploadStore((s) => s.order);
  const tasks = order.map((id) => tasksMap[id]).filter((t): t is UploadTask => !!t);
  const cancel = useUploadStore((s) => s.cancel);
  const retry = useUploadStore((s) => s.retry);
  const dismiss = useUploadStore((s) => s.dismiss);
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const [expanded, setExpanded] = useState(false);

  // Hand the store a *getter*, not a cached token. getSession() forces a
  // refetch against /api/auth/session when the in-memory session is stale,
  // which triggers the Auth.js JWT callback's refresh-token grant. Long
  // uploads (e.g. a 300 MB tarball) thus always send their tail-end
  // `complete` request with a token that's valid right now, instead of the
  // one that was current when the upload started ~10 min ago.
  useEffect(() => {
    setAuthProvider(async () => (await getSession())?.accessToken, locale);
  }, [locale, setAuthProvider]);

  // Hide the dock for the asset whose publish page we're currently on — that
  // page shows the inline file list already. Uploads for *other* assets still
  // surface here.
  const publishMatch = pathname.match(/\/publish\/([^/]+)/);
  const currentAssetId = publishMatch?.[1];
  const dockTasks = tasks.filter((t) => t.input.assetId !== currentAssetId);
  const dockActive = dockTasks.filter((t) => ACTIVE.has(t.status));

  if (dockTasks.length === 0) return null;

  const totalBytes = dockTasks.reduce((a, t) => a + t.totalBytes, 0);
  const doneBytes = dockTasks.reduce((a, t) => a + t.bytesUploaded, 0);
  const overallPct = totalBytes ? Math.min(100, Math.round((doneBytes / totalBytes) * 100)) : 0;
  const stillActive = dockActive.length;

  const goToAsset = (assetId: string) => router.push(`/publish/${assetId}`);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)]">
      <div className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-2">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="hover:bg-surface-muted/50 flex h-14 w-full items-center gap-3 px-4 transition-colors"
        >
          <CircularProgress pct={overallPct} active={stillActive > 0} />
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-[13.5px] font-semibold text-ink">
              {stillActive > 0
                ? `Uploading ${stillActive} file${stillActive === 1 ? '' : 's'} · ${overallPct}%`
                : 'Uploads complete'}
            </p>
            <p className="truncate text-caption text-ink-3">
              {formatBytes(doneBytes, locale)} / {formatBytes(totalBytes, locale)}
            </p>
          </div>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-ink-3" strokeWidth={2.25} />
          ) : (
            <ChevronUp className="h-4 w-4 text-ink-3" strokeWidth={2.25} />
          )}
        </button>

        {expanded ? (
          <ul className="max-h-[320px] divide-y divide-line overflow-y-auto border-t border-line">
            {dockTasks.map((t) => (
              <li key={t.id} className="p-3">
                <button
                  type="button"
                  onClick={() => goToAsset(t.input.assetId)}
                  className="group flex w-full items-center gap-2.5 text-left"
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-surface-muted text-ink-2">
                    <FileBox className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-ink group-hover:text-brand-blue">
                      {t.input.relativePath}
                    </span>
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-line">
                      <span
                        className={cn(
                          'block h-full transition-[width] duration-150',
                          t.status === 'failed'
                            ? 'bg-brand-red'
                            : t.status === 'uploading'
                              ? 'bg-brand-blue'
                              : 'bg-brand-green',
                        )}
                        style={{
                          width: `${
                            t.status === 'analyzing' || t.status === 'ready'
                              ? 100
                              : t.totalBytes
                                ? Math.round((t.bytesUploaded / t.totalBytes) * 100)
                                : 0
                          }%`,
                        }}
                      />
                    </span>
                  </span>
                  <StatusGlyph status={t.status} />
                </button>
                {t.status === 'failed' ? (
                  <div className="mt-1.5 flex items-center gap-2 pl-9">
                    <span className="flex-1 truncate text-caption text-brand-red">{t.error}</span>
                    <button
                      type="button"
                      onClick={() => retry(t.id)}
                      className="text-caption font-medium text-brand-blue hover:underline"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => dismiss(t.id)}
                      className="text-ink-3 hover:text-ink"
                      aria-label="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </button>
                  </div>
                ) : ACTIVE.has(t.status) ? (
                  <div className="mt-1.5 pl-9">
                    <button
                      type="button"
                      onClick={() => cancel(t.id)}
                      className="text-caption text-ink-3 hover:text-brand-red"
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function CircularProgress({ pct, active }: { pct: number; active: boolean }) {
  const r = 12;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center">
      <svg className="h-9 w-9 -rotate-90" viewBox="0 0 32 32">
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-line"
        />
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          className={
            active
              ? 'text-brand-blue transition-[stroke-dashoffset] duration-200'
              : 'text-brand-green'
          }
        />
      </svg>
      <span className="geist-tnum absolute text-[9px] font-semibold text-ink">{pct}</span>
    </span>
  );
}

function StatusGlyph({ status }: { status: UploadTask['status'] }) {
  if (status === 'uploading' || status === 'queued')
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-blue" strokeWidth={2.25} />;
  if (status === 'failed')
    return <AlertCircle className="h-4 w-4 shrink-0 text-brand-red" strokeWidth={2.25} />;
  return <Check className="h-4 w-4 shrink-0 text-brand-green" strokeWidth={2.5} />;
}
