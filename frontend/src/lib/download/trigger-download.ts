'use client';

/** Last path segment: `Pack/Models/rock.fbx` -> `rock.fbx`. */
export function downloadFileName(relativePath: string): string {
  const name = relativePath.replace(/\\/g, '/').split('/').filter(Boolean).pop();
  return name || 'download';
}

/**
 * Starts the browser download of `url` under the file name of `relativePath`.
 *
 * A bare `window.location.href = url` is not enough in the static preview: a `blob:` URL has no
 * file name (the browser would save it under the blob's random id, or even show a text file
 * inline), while an anchor with the `download` attribute names the file. For the real API's signed
 * URLs (another origin) the attribute is ignored and the server's `Content-Disposition` rules, so
 * the same call works there too.
 */
export function triggerDownload(url: string, relativePath: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadFileName(relativePath);
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
