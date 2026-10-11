'use client';

/**
 * Browser-side PUT with upload-progress events. The fetch API doesn't expose
 * upload-progress yet (only `Response.body` for download), so we use
 * XMLHttpRequest underneath. Used by the thumbnail + preview-media uploaders
 * in the publish wizard so the user gets a real percentage rather than an
 * indeterminate spinner.
 *
 * Static preview: a URL with the `preview://` scheme never goes over the network. The "upload" is
 * simulated (about 600 ms in 6 ticks whatever the size) and the bytes go into the local blob store
 * (`@/preview/uploads/blob-store`) under the rest of the URL: `preview://<uploadId>` stores
 * `<uploadId>`, `preview://<uploadId>/part/<n>` stores `<uploadId>/part/<n>`. Files over 5 MB keep
 * only their size there. http(s) URLs keep the XHR behaviour.
 */

/** Scheme of the simulated upload URLs handed out by the preview upload handlers. */
export const PREVIEW_URL_SCHEME = 'preview://';

const SIMULATED_TICKS = 6;
const SIMULATED_TICK_MS = 100;

export interface PutWithProgressOptions {
  url: string;
  body: Blob | File;
  contentType: string;
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

export async function putWithProgress(opts: PutWithProgressOptions): Promise<void> {
  if (opts.url.startsWith(PREVIEW_URL_SCHEME)) return putToPreviewStore(opts);
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', opts.url, true);
    xhr.setRequestHeader('Content-Type', opts.contentType);

    if (opts.signal) {
      const abort = () => xhr.abort();
      if (opts.signal.aborted) {
        abort();
      } else {
        opts.signal.addEventListener('abort', abort, { once: true });
      }
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) {
        opts.onProgress(e.loaded, e.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // Final 100% tick — useful when lengthComputable never fired (rare).
        opts.onProgress?.(opts.body.size, opts.body.size);
        resolve();
      } else {
        reject(new Error(`Upload failed (${xhr.status} ${xhr.statusText})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error while uploading'));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));

    xhr.send(opts.body);
  });
}

const abortError = () => new DOMException('Aborted', 'AbortError');

/** Simulated upload: a timer-driven progress run, then the blob goes into the local store. */
function putToPreviewStore(opts: PutWithProgressOptions): Promise<void> {
  const id = opts.url.slice(PREVIEW_URL_SCHEME.length);
  const total = opts.body.size;
  return new Promise<void>((resolve, reject) => {
    const { signal } = opts;
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    let tick = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const step = () => {
      tick += 1;
      opts.onProgress?.(Math.round((total * tick) / SIMULATED_TICKS), total);
      if (tick < SIMULATED_TICKS) {
        timer = setTimeout(step, SIMULATED_TICK_MS);
        return;
      }
      signal?.removeEventListener('abort', onAbort);
      import('@/preview/uploads/blob-store')
        .then(({ getBlobStore }) =>
          getBlobStore().put(id, opts.body, { type: opts.contentType || opts.body.type }),
        )
        .then(() => resolve(), reject);
    };
    timer = setTimeout(step, SIMULATED_TICK_MS);
  });
}
