'use client';

/**
 * Browser-side PUT with upload-progress events. The fetch API doesn't expose
 * upload-progress yet (only `Response.body` for download), so we use
 * XMLHttpRequest underneath. Used by the thumbnail + preview-media uploaders
 * in the publish wizard so the user gets a real percentage rather than an
 * indeterminate spinner.
 */
export interface PutWithProgressOptions {
  url: string;
  body: Blob | File;
  contentType: string;
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

export async function putWithProgress(opts: PutWithProgressOptions): Promise<void> {
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
