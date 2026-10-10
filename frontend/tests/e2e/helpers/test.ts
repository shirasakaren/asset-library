import { test as base, expect, type Page } from '@playwright/test';

/**
 * Shared `test` for the static-export suite.
 *
 * Adds an automatic guard to every test: it fails on any uncaught page error,
 * any `console.error` that is not in {@link CONSOLE_ERROR_ALLOWLIST}, and any
 * failed subresource request (image, script, stylesheet, font) such as a
 * missing `/thumbs/*.webp`.
 */

/**
 * `console.error` messages that are known and harmless.
 *
 * - The browser logs "Failed to load resource ... 404" for the document (or
 *   RSC payload) request of a path that is not pre-rendered. The app is a
 *   static export: user-created ids (`/publish/<id>/`, `/assets/<id>/`) and
 *   unknown paths are answered by the server with `/404.html` (status 404,
 *   exactly like GitHub Pages) and then resolved on the client by the
 *   registered 404 shell. The 404 itself is the mechanism, not a bug.
 *   Only document/fetch/other 404s are tolerated here; a 404 for an image,
 *   script, stylesheet or font fails the test through the request guard.
 */
export const CONSOLE_ERROR_ALLOWLIST: RegExp[] = [
  /Failed to load resource: the server responded with a status of 404/,
];

const SUBRESOURCE_TYPES = new Set(['image', 'script', 'stylesheet', 'font', 'media']);

interface Problems {
  list: string[];
}

export const test = base.extend<{ problems: Problems }>({
  problems: [
    async ({ page }, use) => {
      const problems: Problems = { list: [] };
      page.on('pageerror', (err) => problems.list.push(`pageerror: ${err.message}`));
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        if (CONSOLE_ERROR_ALLOWLIST.some((re) => re.test(text))) return;
        problems.list.push(`console.error: ${text}`);
      });
      page.on('response', (res) => {
        if (res.status() < 400) return;
        const req = res.request();
        if (SUBRESOURCE_TYPES.has(req.resourceType())) {
          problems.list.push(`${res.status()} for ${req.resourceType()} ${res.url()}`);
        }
      });
      await use(problems);
      expect(
        problems.list,
        'unexpected page errors / console errors / failed subresources',
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
export type { Page };
