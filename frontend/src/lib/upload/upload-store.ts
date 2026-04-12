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
