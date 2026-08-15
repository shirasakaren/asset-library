'use client';

import { create } from 'zustand';
import { apiFetch } from '@/lib/api/fetcher';
import { logEvent } from '@/lib/logger.events';
import { logger } from '@/lib/logger';
import type { LocaleCode } from '@/lib/api/types';
import type {
  InitiateMultipartResponse,
  InitiateUploadResponse,
  UploadStatus,
  UploadTask,
} from './types';

const SINGLE_SHOT_CAP = 100 * 1024 * 1024; // 100 MB
// S3 caps a multipart upload at 10,000 parts. Pick a part size that keeps the
// part count under that for any file size, with a sane 10 MB floor.
const MIN_PART_SIZE = 10 * 1024 * 1024;
const MAX_PARTS = 10_000;
const MAX_PARALLEL_PARTS = 4;
/** Files larger than this warn the user the upload may take a while. */
export const LARGE_FILE_WARN_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

function partSizeFor(fileSize: number): number {
  const needed = Math.ceil(fileSize / MAX_PARTS);
  return Math.max(MIN_PART_SIZE, needed);
}

// Module-scoped (non-reactive) registries that must survive route changes and
// can't live in the serializable store: the actual File blobs and the
// AbortControllers for in-flight uploads.
const fileRegistry = new Map<string, File>();
const controllers = new Map<string, { ctrl: AbortController; xhrs: Set<XMLHttpRequest> }>();

/** Async getter for the *current* access token. See setAuthProvider. */
export type AccessTokenProvider = () => Promise<string | undefined>;

interface UploadStoreState {
  tasks: Record<string, UploadTask>;
  /** Order of task ids for stable rendering. */
  order: string[];
  /**
   * Async getter the upload runner calls on every request. Holding a getter
   * (not a cached string) is what fixes the long-upload 401: a 300 MB upload
   * can easily outlive Keycloak's 5 min access-token TTL, and the
   * `complete` call at the end has to use whatever token is current *then*,
   * not the one that was current when the upload started. The getter is
   * supplied by <UploadDock/> via `setAuthProvider`.
   */
  tokenProvider?: AccessTokenProvider;
  locale: LocaleCode;
  /** Register the token getter + locale. Replaces the old setAuth cache. */
  setAuthProvider: (provider: AccessTokenProvider | undefined, locale: LocaleCode) => void;
  addFiles: (
    assetId: string,
    versionId: string,
    items: { file: File; relativePath: string }[],
  ) => void;
  cancel: (taskId: string) => void;
  retry: (taskId: string) => void;
  /** Remove a finished/cancelled/failed task row from the list. */
  dismiss: (taskId: string) => void;
  /** Remove whichever task finalized to this backend file id (used on delete). */
  dismissByFileId: (fileId: string) => void;
  /** Clear all terminal tasks (ready/cancelled/failed). */
  clearFinished: () => void;
  /** Test-only: resolve the token via the registered provider. */
  __resolveAccessToken: () => Promise<string | undefined>;
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

export const useUploadStore = create<UploadStoreState>((set, get) => {
  const patch = (id: string, p: Partial<UploadTask>) =>
    set((s) => {
      const cur = s.tasks[id];
      if (!cur) return s;
      return { tasks: { ...s.tasks, [id]: { ...cur, ...p } } };
    });

  const resolveAccessToken = async (): Promise<string | undefined> => {
    const provider = get().tokenProvider;
    if (!provider) return undefined;
    try {
      return await provider();
    } catch {
      return undefined;
    }
  };

  const authedFetch = async <T = unknown>(
    path: string,
    init: Parameters<typeof apiFetch>[1] = {},
  ): Promise<T> => {
    const { locale, tokenProvider } = get();
    // Resolve once up-front (so the Bearer reflects the latest token), and
    // hand the same getter to apiFetch as a 401-retry refresher. Together this
    // gives long-running uploads two chances to land their tail-end requests
    // with a valid token: a fresh one at send-time, and a forced refresh + one
    // retry if the token expired mid-flight.
    const accessToken = await resolveAccessToken();
    return apiFetch<T>(path, {
      accessToken,
      locale,
      tokenRefresher: tokenProvider,
      ...init,
    });
  };

  async function runTask(task: UploadTask): Promise<void> {
    const file = fileRegistry.get(task.id);
    if (!file) {
      patch(task.id, { status: 'failed', error: 'File reference lost (reload the page).' });
      return;
    }
    const ctrl = new AbortController();
    controllers.set(task.id, { ctrl, xhrs: new Set() });
    logEvent('upload.start', {
      assetId: task.input.assetId,
      versionId: task.input.versionId,
      bytes: file.size,
    });
    try {
      patch(task.id, { status: 'uploading', bytesUploaded: 0, error: undefined });
      if (file.size <= SINGLE_SHOT_CAP) {
        await runSingleShot(task, file, ctrl);
      } else {
        await runMultipart(task, file, ctrl);
      }
      patch(task.id, { status: 'analyzing', bytesUploaded: file.size });
    } catch (err) {
      if (ctrl.signal.aborted) {
        patch(task.id, { status: 'cancelled' });
        return;
      }
      logger.warn('upload.failed', {
        id: task.id,
        err: err instanceof Error ? err.message : String(err),
      });
      patch(task.id, { status: 'failed', error: err instanceof Error ? err.message : String(err) });
    } finally {
      controllers.delete(task.id);
    }
  }

  async function runSingleShot(task: UploadTask, file: File, ctrl: AbortController): Promise<void> {
    const initiate = await authedFetch<InitiateUploadResponse>('/files/uploads/initiate', {
      method: 'POST',
      body: {
        assetId: task.input.assetId,
        versionId: task.input.versionId,
        relativePath: task.input.relativePath,
        contentType: file.type || 'application/octet-stream',
        bytes: file.size,
      },
      signal: ctrl.signal,
    });
    patch(task.id, { fileId: initiate.fileId, uploadId: initiate.uploadId });
    await putWithProgress(task.id, initiate.putUrl, file, file.type, ctrl, (loaded) =>
      patch(task.id, { bytesUploaded: loaded }),
    );
    await authedFetch('/files/uploads/complete', {
      method: 'POST',
      body: { uploadId: initiate.uploadId },
      signal: ctrl.signal,
    });
  }

  async function runMultipart(task: UploadTask, file: File, ctrl: AbortController): Promise<void> {
    const partSize = partSizeFor(file.size);
    const partCount = Math.max(1, Math.ceil(file.size / partSize));
    const initiate = await authedFetch<InitiateMultipartResponse>(
      '/files/uploads/multipart/initiate',
      {
        method: 'POST',
        body: {
          assetId: task.input.assetId,
          versionId: task.input.versionId,
          relativePath: task.input.relativePath,
          contentType: file.type || 'application/octet-stream',
          bytes: file.size,
          partCount,
        },
        signal: ctrl.signal,
      },
    );
    patch(task.id, { fileId: initiate.fileId, uploadId: initiate.uploadId });

    const bytesPerPart = new Map<number, number>();
    const bump = () =>
      patch(task.id, {
        bytesUploaded: Array.from(bytesPerPart.values()).reduce((a, b) => a + b, 0),
      });

    const partsToDo = initiate.partUrls.slice();
    const worker = async () => {
      while (partsToDo.length > 0) {
        if (ctrl.signal.aborted) return;
        const part = partsToDo.shift();
        if (!part) return;
        const start = (part.partNumber - 1) * partSize;
        const blob = file.slice(start, Math.min(file.size, start + partSize));
        await putWithProgress(task.id, part.url, blob, file.type, ctrl, (loaded) => {
          bytesPerPart.set(part.partNumber, loaded);
          bump();
        });
      }
    };
    await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_PARTS, partCount) }, worker));
    if (ctrl.signal.aborted) return;
    // ETags are sourced server-side via ListParts — no need to send them.
    await authedFetch('/files/uploads/multipart/complete', {
      method: 'POST',
      body: { uploadId: initiate.uploadId },
      signal: ctrl.signal,
    });
  }

  function putWithProgress(
    taskId: string,
    url: string,
    blob: Blob,
    contentType: string,
    ctrl: AbortController,
    onProgress: (loaded: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      controllers.get(taskId)?.xhrs.add(xhr);
      xhr.open('PUT', url);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded);
      };
      xhr.onload = () => {
        controllers.get(taskId)?.xhrs.delete(xhr);
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(blob.size);
          resolve();
        } else reject(new Error(`PUT failed: ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('PUT network error'));
      xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
      ctrl.signal.addEventListener('abort', () => xhr.abort(), { once: true });
      xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream');
      xhr.send(blob);
    });
  }

  return {
    tasks: {},
    order: [],
    locale: 'en',
    setAuthProvider: (provider, locale) => set({ tokenProvider: provider, locale }),
    __resolveAccessToken: () => resolveAccessToken(),

    addFiles: (assetId, versionId, items) => {
      const created: UploadTask[] = items.map((it) => {
        const id = cryptoRandomId();
        fileRegistry.set(id, it.file);
        return {
          id,
          input: { assetId, versionId, file: it.file, relativePath: it.relativePath },
          status: 'queued' as UploadStatus,
          bytesUploaded: 0,
          totalBytes: it.file.size,
        };
      });
      set((s) => ({
        tasks: { ...s.tasks, ...Object.fromEntries(created.map((t) => [t.id, t])) },
        order: [...s.order, ...created.map((t) => t.id)],
      }));
      for (const t of created) void runTask(t);
    },

    cancel: (taskId) => {
      const c = controllers.get(taskId);
      if (c) {
        c.ctrl.abort();
        c.xhrs.forEach((x) => x.abort());
      }
      patch(taskId, { status: 'cancelled' });
    },

    retry: (taskId) => {
      const task = get().tasks[taskId];
      if (!task) return;
      patch(taskId, { status: 'queued', bytesUploaded: 0, error: undefined });
      void runTask({ ...task, status: 'queued', bytesUploaded: 0, error: undefined });
    },

    dismiss: (taskId) => {
      fileRegistry.delete(taskId);
      controllers.delete(taskId);
      set((s) => {
        const next = { ...s.tasks };
        delete next[taskId];
        return { tasks: next, order: s.order.filter((id) => id !== taskId) };
      });
    },

    dismissByFileId: (fileId) => {
      const ids = get().order.filter((id) => get().tasks[id]?.fileId === fileId);
      for (const id of ids) get().dismiss(id);
    },

    clearFinished: () =>
      set((s) => {
        const terminal = new Set(['ready', 'cancelled', 'failed', 'analyzing']);
        const keep = s.order.filter((id) => !terminal.has(s.tasks[id]?.status ?? ''));
        const tasks: Record<string, UploadTask> = {};
        for (const id of keep) tasks[id] = s.tasks[id]!;
        s.order.forEach((id) => {
          if (!keep.includes(id)) {
            fileRegistry.delete(id);
            controllers.delete(id);
          }
        });
        return { tasks, order: keep };
      }),
  };
});

/** The store slice the pure selectors below read. */
type TaskSlice = Pick<UploadStoreState, 'tasks' | 'order'>;

/** Convenience selector: tasks for a specific asset+version, in order. */
export function selectTasksFor(state: TaskSlice, assetId: string, versionId: string): UploadTask[] {
  return state.order
    .map((id) => state.tasks[id])
    .filter(
      (t): t is UploadTask => !!t && t.input.assetId === assetId && t.input.versionId === versionId,
    );
}

// A task whose bytes are fully uploaded and whose AssetFile row is finalized
// server-side. The post-upload analyzer/AV stages don't change fileCount, so
// they all count as "done" for the purpose of the publish checklist.
const UPLOAD_DONE_STATUSES: ReadonlySet<UploadStatus> = new Set<UploadStatus>([
  'analyzing',
  'av-scanning',
  'ready',
]);

/**
 * Backend file ids of finished uploads for an asset+version. The wizard watches
 * this so the "at least 1 file uploaded" checklist item ticks the moment an
 * upload completes, without a manual reload.
 */
export function selectCompletedFileIdsFor(
  state: TaskSlice,
  assetId: string,
  versionId: string,
): string[] {
  return selectTasksFor(state, assetId, versionId)
    .filter((t) => !!t.fileId && UPLOAD_DONE_STATUSES.has(t.status))
    .map((t) => t.fileId as string);
}
