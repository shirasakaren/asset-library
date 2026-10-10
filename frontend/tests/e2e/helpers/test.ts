import { test as base, expect, type Page, type Response } from '@playwright/test';

/**
 * Shared `test` for the static-export suite.
 *
 * Adds an automatic guard to every test, on every page of the test's browser
 * context (including tabs opened with `context.newPage()`):
 *
 * - any uncaught page error fails the test;
 * - any `console.error` fails the test;
 * - any HTTP response with status >= 400 fails the test, whatever its resource
 *   type (document, fetch/xhr, script, stylesheet, image, font, media...).
 *
 * The only way to tolerate a 404 is to declare it for the test with the
 * `expectedNotFound` option (patterns tested against the URL *pathname*,
 * built with `expectNotFound(shellRoute(...))`). It exists for the static export's 404
 * shell: an id created in the browser (`/publish/<id>/`, `/assets/<slug>/`) has
 * no HTML file, so the host answers the document request with `/404.html` and
 * status 404 and the client then renders the real route. A client-side
 * navigation to such a URL first asks for its RSC payload (a `fetch`), which
 * 404s the same way, so a declared pattern also covers that fetch and the
 * browser's matching "Failed to load resource ... 404" console line (matched by
 * the URL of the message, never globally). Everything else that 404s fails.
 *
 * Declare it narrowly, per file or describe:
 *
 *   test.use(expectNotFound(shellRoute('/publish/:id')));
 */
export interface GuardOptions {
  // An object, not an array: Playwright reads an array passed to test.use() as a fixture tuple.
  expectedNotFound: { documents: RegExp[] };
}

/** Declares the 404 documents a test or describe loads on purpose: `test.use(expectNotFound(...))`. */
export function expectNotFound(...documents: RegExp[]): GuardOptions {
  return { expectedNotFound: { documents } };
}

const FAILED_LOAD = /^Failed to load resource/;

/**
 * Pattern for a route the host cannot pre-render, e.g. `shellRoute('/assets/:slug')`:
 * the pathname with or without trailing slash, plus the RSC payload file
 * (`index.txt`) that a client-side navigation asks for. `:name` matches one segment.
 */
export function shellRoute(template: string): RegExp {
  const source = template
    .split('/')
    .map((seg) => (seg.startsWith(':') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${source}(/(index\\.txt)?)?$`);
}

export const test = base.extend<GuardOptions & { problems: string[] }>({
  expectedNotFound: [{ documents: [] }, { option: true }],

  problems: [
    async ({ context, expectedNotFound }, use) => {
      const problems: string[] = [];
      const isExpected = (url: string): boolean => {
        const { pathname } = new URL(url);
        return expectedNotFound.documents.some((re) => re.test(pathname));
      };
      const attached = new WeakSet<Page>();

      const attach = (page: Page) => {
        if (attached.has(page)) return;
        attached.add(page);
        page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
        page.on('console', (msg) => {
          if (msg.type() !== 'error') return;
          const text = msg.text();
          // The browser's own "Failed to load resource: ... 404" line: tolerated only for a
          // declared 404 URL (the response guard below judges the request itself).
          if (FAILED_LOAD.test(text) && /\b404\b/.test(text) && isExpected(msg.location().url)) {
            return;
          }
          problems.push(`console.error: ${text} (${msg.location().url})`);
        });
        page.on('response', (res: Response) => {
          if (res.status() < 400) return;
          if (res.status() === 404 && isExpected(res.url())) return;
          problems.push(`${res.status()} ${res.request().resourceType()} ${res.url()}`);
        });
      };

      context.pages().forEach(attach);
      context.on('page', attach);
      await use(problems);
      expect(
        problems,
        'unexpected page errors, console errors or HTTP failures (declare real 404 documents with expectNotFound)',
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
export type { Page };
