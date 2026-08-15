'use client';

import { apiFetch } from '@/lib/api/fetcher';
import { putWithProgress } from '@/lib/upload/put-with-progress';

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

  return { viewUrl: initiate.viewUrl, key: initiate.key };
}
