'use client';

import { apiFetch } from '@/lib/api/fetcher';
import { PREVIEW_URL_SCHEME, putWithProgress } from '@/lib/upload/put-with-progress';

interface InitiateResponse {
  putUrl: string;
  key: string;
  viewUrl: string;
  expiresAt: string;
}

export interface UploadEditorMediaOptions {
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Uploads a single editor-media asset (image, video, gif) and returns the
 * long-lived signed GET URL the TipTap node should reference. Used by
 * both the description editor (drag/drop/paste) and the comment composer.
 *
 * Pass `options.onProgress` to drive a UI progress bar — the call uses
 * XMLHttpRequest under the hood because the fetch API doesn't expose
 * upload-progress events.
 */
export async function uploadEditorMedia(
  file: File,
  accessToken: string | undefined,
  options?: UploadEditorMediaOptions,
): Promise<{ viewUrl: string; key: string }> {
  const initiate = await apiFetch<InitiateResponse>('/files/editor-media/initiate', {
    method: 'POST',
    body: { contentType: file.type || 'application/octet-stream', bytes: file.size },
    accessToken,
  });

  await putWithProgress({
    url: initiate.putUrl,
    body: file,
    contentType: file.type || 'application/octet-stream',
    onProgress: options?.onProgress,
    signal: options?.signal,
  });

  // Static preview: the bytes went to the local blob store, so `initiate.viewUrl` is only a
  // reference. `refresh` (a real endpoint of the API) returns the URL the editor can display and
  // that is safe to persist in the document.
  if (initiate.putUrl.startsWith(PREVIEW_URL_SCHEME)) {
    const fresh = await apiFetch<{ viewUrl: string }>('/files/editor-media/refresh', {
      method: 'POST',
      body: { key: initiate.key },
      accessToken,
    });
    return { viewUrl: fresh.viewUrl, key: initiate.key };
  }

  return { viewUrl: initiate.viewUrl, key: initiate.key };
}
