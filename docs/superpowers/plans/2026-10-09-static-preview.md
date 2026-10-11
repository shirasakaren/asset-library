# Static Preview Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `frontend/` into a login-free static demo with a bundled ~130-asset catalog, an in-browser mock API, per-browser persistence, and CI/CD to GitHub Pages at `asset.creations.ren`.

**Architecture:** `apiFetch` (the single network boundary) dispatches to an in-browser router + handlers over a read-only seed (JSON) merged with a per-visitor IndexedDB overlay. Server-rendered pages become client components using the same TanStack query keys. Next.js builds with `output: 'export'`.

**Tech Stack:** Next.js 15 (static export), React 19 RC, TanStack Query 5, next-intl 3 (client provider), Zustand, IndexedDB (`fake-indexeddb` for tests), Vitest 2, Playwright, `sharp` + `yaml` (seed scripts, dev only), pnpm 9, GitHub Actions Pages.

**Spec:** `docs/superpowers/specs/2026-10-09-static-preview-design.md`

## Global Constraints

- Site is served from the **root** of `asset.creations.ren`; `NEXT_PUBLIC_BASE_PATH` defaults to empty.
- Catalog: **≥ 100 assets (target ~130)**, all **10 categories** populated, all engines represented (`UNITY`, `UNREAL`, `BLENDER`, `STANDALONE_3D`, `AUDIO`, `IMAGE`, `VIDEO`, `OTHER`, `ENGINE_AGNOSTIC` where sensible).
- Every asset has a real bundled thumbnail in `frontend/public/thumbs/` and a link to its original store page.
- Asset "files" are `.txt` containing the real store URL; no real binaries are stored.
- Visitor changes persist **only in the visitor's browser** (IndexedDB overlay); no network calls to any API.
- Persona is an **admin**. No sign-in screen, no auth redirects.
- No `next-auth`, middleware, API route handlers, Sentry, or WebSocket transport remain in `frontend/`.
- Query keys in `src/lib/api/queries.ts` and component props are **not renamed**; the mock honors existing response types in `src/lib/api/types.ts` / `admin-types.ts`.
- Seed generation is deterministic (seeded PRNG); rebuilds produce identical JSON.
- Site stays `noindex`. Footer states thumbnails belong to their creators and gives `it@labmgm.org` for removal requests.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Working branch: `feat/static-preview`. Run all commands from `frontend/` unless noted; shell is Git Bash.

## Review Focus

1. **Corrupt / blocked IndexedDB** (private mode, quota, malformed overlay row): app must still boot on seed data and show a one-time toast, never a blank page.
2. **Seed version bump with an old overlay referencing removed ids**: overlay is reset with a toast; no crash, no dangling references.
3. **Deep link / hard refresh on a user-created entity** (`/assets/my-new-asset/`): must render the page, not a GitHub 404.
4. **Unknown or unsupported endpoint** hit by a component: surfaces as a normal `ApiError` (404 problem), not an unhandled rejection or infinite spinner.
5. **Pagination cursors / empty results / sort ties** in assets, search, library and admin lists: stable order, no duplicates across pages, empty lists return `items: []`.
6. **Locale switch** persists across reload and applies to both seed text (`en`/`id` names) and UI messages.

---

## File Structure

```
frontend/
  next.config.mjs                       MODIFY  export mode
  package.json                          MODIFY  drop next-auth/@sentry/nextjs, add devDeps
  scripts/seed/
    assets.yaml                         CREATE  curated source list (~130 entries)
    thumbs.ts                           CREATE  download + resize thumbnails
    build-seed.ts                       CREATE  deterministic seed generator
    prng.ts                             CREATE  mulberry32 PRNG
  public/thumbs/*.webp                  CREATE  generated
  src/preview/
    types.ts                            CREATE  PreviewRequest, Handler, Db, SeedSource
    store/
      overlay.ts                        CREATE  IndexedDB overlay (get/put/del/clear)
      db.ts                             CREATE  seed+overlay merged Db implementation
      seed-source.ts                    CREATE  dynamic-import seed loader
      version.ts                        CREATE  SEED_VERSION constant + migration check
    router/
      router.ts                         CREATE  route table, match, dispatch
      errors.ts                         CREATE  problem helpers (notFound, badRequest, forbidden)
      paginate.ts                       CREATE  cursor pagination helper
    handlers/                           CREATE  one file per domain (tasks 7-11)
    session/
      me-provider.tsx                   CREATE  MeProvider, useMe, useSession stub
    events/
      bus.ts                            CREATE  local event bus (replaces WebSocket)
    seed-data/*.json                    CREATE  generated, committed
    index.ts                            CREATE  previewFetch(), getDb(), resetDemo()
    test-utils.ts                       CREATE  createTestApp() for handler tests
  src/lib/api/fetcher.ts                MODIFY  dispatch to previewFetch
  src/lib/api/client.ts                 MODIFY  no next-auth
  src/app/**                            MODIFY  server pages -> client (task 5)
  src/components/preview/
    preview-banner.tsx                  CREATE
    attribution-notice.tsx              CREATE
  tests/unit/preview/**                 CREATE
  tests/e2e/**                          MODIFY  preview smoke specs
.github/workflows/pages.yml             CREATE
.github/workflows/production.yml        MODIFY  gate web image
.github/workflows/staging.yml           MODIFY  gate web image
```

---

### Task 0: Baseline and dependencies

**Files:**
- Modify: `package.json` (root lockfile via pnpm)

**Interfaces:**
- Produces: working `pnpm` install; known baseline status of `typecheck`, `test`, `build`.

- [ ] **Step 1: Install and record baseline**

```bash
cd /c/Users/muham/ren/asset-library && pnpm install --frozen-lockfile
cd frontend && pnpm typecheck; pnpm test 2>&1 | tail -15
```
Expected: record which (if any) fail before our changes. Do not fix pre-existing failures unrelated to this work; note them in the commit message of Task 12.

- [ ] **Step 2: Add dev dependencies**

```bash
cd /c/Users/muham/ren/asset-library/frontend && pnpm add -D fake-indexeddb yaml sharp tsx
```

- [ ] **Step 3: Commit**

```bash
git add package.json ../pnpm-lock.yaml && git commit -m "chore(preview): add seed/test dev dependencies

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Spike — static export with client-resolved dynamic routes

Proves spec §3.4 before anything else is built. Throwaway code stays on the branch only if it works.

**Files:**
- Modify: `next.config.mjs`
- Create: `src/app/spike/[id]/page.tsx`, update `src/app/not-found.tsx`
- Create: `scripts/serve-export.mjs` (static server with GitHub-Pages-like 404 behavior)

**Interfaces:**
- Produces: decision recorded in `docs/superpowers/specs/2026-10-09-static-preview-design.md` §3.4 (works / fallback chosen); `scripts/serve-export.mjs <dir> <port>` reused by Playwright later; `matchDynamicRoute(pathname)` helper at `src/preview/router/dynamic-route.ts`.

- [ ] **Step 1: Static server mimicking Pages**

```js
// scripts/serve-export.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [dir = 'out', port = '4173'] = process.argv.slice(2);
const root = path.resolve(dir);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.txt': 'text/plain', '.woff2': 'font/woff2' };

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const candidates = [clean, path.join(clean, 'index.html'), clean + '.html'];
  for (const c of candidates) {
    const f = path.join(root, c);
    if (f.startsWith(root) && fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

http.createServer((req, res) => {
  const file = resolveFile(req.url);
  if (file) {
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
    return fs.createReadStream(file).pipe(res);
  }
  // GitHub Pages serves /404.html with status 404 for unknown paths.
  const nf = path.join(root, '404.html');
  res.writeHead(404, { 'Content-Type': 'text/html' });
  fs.existsSync(nf) ? fs.createReadStream(nf).pipe(res) : res.end('Not found');
}).listen(Number(port), () => console.log(`serving ${root} on :${port}`));
```

- [ ] **Step 2: Configure export**

In `next.config.mjs` set `output: 'export'`, `trailingSlash: true`, `images: { unoptimized: true }`, `basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? ''`; delete `headers()` and the `remotePatterns` block. (Temporarily keep `withNextIntl`; Task 4 removes server i18n.)

- [ ] **Step 3: Spike page + 404 shell**

`src/app/spike/[id]/page.tsx`: `export function generateStaticParams() { return [{ id: 'seeded' }]; }` and a client component printing `params.id`. In `src/app/not-found.tsx` (make it `'use client'`), if `usePathname()` matches `^/spike/([^/]+)/?$`, render the same client component with the captured id; otherwise the normal 404 UI. Add `matchDynamicRoute`:

```ts
// src/preview/router/dynamic-route.ts
export interface DynamicMatch { route: string; params: Record<string, string> }
const ROUTES: { route: string; re: RegExp; keys: string[] }[] = [
  { route: '/spike/[id]', re: /^\/spike\/([^/]+)\/?$/, keys: ['id'] },
];
export function matchDynamicRoute(pathname: string): DynamicMatch | null {
  for (const r of ROUTES) {
    const m = r.re.exec(pathname);
    if (m) return { route: r.route, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)])) };
  }
  return null;
}
```

- [ ] **Step 4: Build and verify**

Build needs env: `NEXT_PUBLIC_APP_URL=http://localhost:4173 NEXT_PUBLIC_API_URL=http://localhost:1 NEXT_PUBLIC_WS_URL=ws://localhost:1`. If the build fails because of server pages (cookies/auth), temporarily move them aside in the spike branch only (`git stash` them afterwards); the point is only the `spike` route.
Run: `pnpm build && node scripts/serve-export.mjs out 4173 &` then
`curl -s -o /dev/null -w "%{http_code}\n" localhost:4173/spike/seeded/` → 200 and
`curl -s -o /dev/null -w "%{http_code}\n" localhost:4173/spike/brand-new-id/` → 404 with the shell HTML.
Then open `localhost:4173/spike/brand-new-id/` in headless Playwright and assert the text `brand-new-id` is rendered.

- [ ] **Step 5: Record decision and clean up**

If the 404 shell renders the client page: keep `matchDynamicRoute` (empty `ROUTES` + real routes added in Task 5), delete `src/app/spike`. If not: switch the spec to the query-string fallback (`/assets/view/?id=…`) and amend Task 5 accordingly. Edit spec §3.4 with the outcome.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "spike(preview): prove static export with client-resolved dynamic routes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Store — seed source, IndexedDB overlay, merged Db

**Files:**
- Create: `src/preview/types.ts`, `src/preview/store/overlay.ts`, `src/preview/store/db.ts`, `src/preview/store/seed-source.ts`, `src/preview/store/version.ts`
- Test: `tests/unit/preview/store.test.ts`

**Interfaces:**
- Produces (used by every later task):

```ts
// src/preview/types.ts
export type CollectionName =
  | 'assets' | 'users' | 'categories' | 'tags' | 'licenses' | 'comments'
  | 'notifications' | 'requests' | 'reports' | 'library' | 'audit'
  | 'featured' | 'devices' | 'webhooks' | 'storage' | 'analytics' | 'kv';
export interface Doc { id: string }
export interface SeedSource { load(coll: CollectionName): Promise<Doc[]> }
export interface OverlayEntry { op: 'put' | 'del'; doc?: Doc }
export interface OverlayStore {
  open(): Promise<void>;
  all(): Promise<Map<string, OverlayEntry>>;           // key = `${coll}/${id}`
  set(key: string, entry: OverlayEntry): Promise<void>;
  clear(): Promise<void>;
  getMeta(k: string): Promise<string | undefined>;
  setMeta(k: string, v: string): Promise<void>;
}
export interface Db {
  list<T extends Doc>(coll: CollectionName): Promise<T[]>;
  get<T extends Doc>(coll: CollectionName, id: string): Promise<T | undefined>;
  put<T extends Doc>(coll: CollectionName, doc: T): Promise<T>;
  patch<T extends Doc>(coll: CollectionName, id: string, partial: Partial<T>): Promise<T>;
  remove(coll: CollectionName, id: string): Promise<void>;
  reset(): Promise<void>;
  readonly persistent: boolean;                        // false => in-memory fallback
}
export function createDb(opts: { seed: SeedSource; overlay: OverlayStore | null; seedVersion: string }): Promise<Db>;
```

- [ ] **Step 1: Failing tests**

```ts
// tests/unit/preview/store.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '@/preview/store/db';
import { createIdbOverlay } from '@/preview/store/overlay';
import type { SeedSource, Doc } from '@/preview/types';

const seed: SeedSource = {
  async load(coll) {
    if (coll === 'assets') return [{ id: 'a1', title: 'One' } as Doc, { id: 'a2', title: 'Two' } as Doc];
    return [];
  },
};

describe('db', () => {
  beforeEach(() => { indexedDB = new IDBFactory(); });

  it('merges seed with overlay puts and tombstones', async () => {
    const db = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
    await db.patch('assets', 'a1', { title: 'Changed' } as never);
    await db.remove('assets', 'a2');
    await db.put('assets', { id: 'a3', title: 'New' } as never);
    const ids = (await db.list('assets')).map((d) => d.id).sort();
    expect(ids).toEqual(['a1', 'a3']);
    expect((await db.get<any>('assets', 'a1'))!.title).toBe('Changed');
  });

  it('persists across a new Db instance', async () => {
    const overlay = createIdbOverlay();
    const db1 = await createDb({ seed, overlay, seedVersion: '1' });
    await db1.put('assets', { id: 'a9', title: 'Kept' } as never);
    const db2 = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
    expect(await db2.get('assets', 'a9')).toBeTruthy();
  });

  it('resets overlay when seedVersion changes', async () => {
    const db1 = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
    await db1.put('assets', { id: 'a9' } as never);
    const db2 = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '2' });
    expect(await db2.get('assets', 'a9')).toBeUndefined();
  });

  it('falls back to memory when overlay is null and flags persistent=false', async () => {
    const db = await createDb({ seed, overlay: null, seedVersion: '1' });
    await db.put('assets', { id: 'x' } as never);
    expect(db.persistent).toBe(false);
    expect(await db.get('assets', 'x')).toBeTruthy();
  });

  it('survives a throwing overlay (Review Focus 1)', async () => {
    const bad = { open: async () => { throw new Error('blocked'); } } as never;
    const db = await createDb({ seed, overlay: bad, seedVersion: '1' });
    expect(db.persistent).toBe(false);
    expect((await db.list('assets')).length).toBe(2);
  });

  it('reset() clears overlay back to seed', async () => {
    const db = await createDb({ seed, overlay: createIdbOverlay(), seedVersion: '1' });
    await db.remove('assets', 'a1');
    await db.reset();
    expect((await db.list('assets')).length).toBe(2);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm vitest run tests/unit/preview/store.test.ts` → module not found.

- [ ] **Step 3: Implement**

`overlay.ts` — `createIdbOverlay(): OverlayStore` over database `mgm-preview` (v1), stores `overlay` (keyPath `key`) and `meta` (keyPath `k`), promise-wrapped. `open()` rejects if `indexedDB` is undefined or the open request errors.

`db.ts` — `createDb`:
1. If `overlay` is non-null, `try { await overlay.open(); entries = await overlay.all(); if (await overlay.getMeta('seedVersion') !== seedVersion) { await overlay.clear(); entries = new Map(); await overlay.setMeta('seedVersion', seedVersion); } } catch { overlay = null; entries = new Map(); }`; also wrap each entry parse so a malformed row (missing `op`) is dropped.
2. `persistent = overlay !== null`.
3. Seed collections are loaded lazily and cached in a `Map<CollectionName, Doc[]>`; `list` = seed docs overridden by overlay `put`, minus `del`, plus overlay-only puts (stable order: seed order, then created order).
4. `put/patch/remove` update the in-memory `entries` map first, then `await overlay?.set(...)` inside try/catch (a write failure flips `persistent` to false; it must not throw).
5. `reset()` clears `entries` and the overlay, then sets `seedVersion` meta.
6. `patch` on a missing id throws `Error('not found')`.

`seed-source.ts` — `createSeedSource(): SeedSource` using a static map of dynamic imports (`assets: () => import('../seed-data/assets.json')`, …); missing files resolve to `[]`.
`version.ts` — `export const SEED_VERSION = '1';`

- [ ] **Step 4: Run, expect PASS** — `pnpm vitest run tests/unit/preview/store.test.ts`

- [ ] **Step 5: Commit** — `feat(preview): seed + IndexedDB overlay store`

---

### Task 3: Router, errors, pagination, `previewFetch`, test harness

**Files:**
- Create: `src/preview/router/router.ts`, `errors.ts`, `paginate.ts`, `src/preview/index.ts`, `src/preview/test-utils.ts`
- Modify: `src/lib/api/fetcher.ts`
- Test: `tests/unit/preview/router.test.ts`, extend `tests/unit/api-fetcher-retry.test.ts` if it breaks

**Interfaces:**
- Consumes: `Db` from Task 2; `ApiError` / `ProblemDetail` from `src/lib/api/errors.ts`.
- Produces:

```ts
// router.ts
export interface PreviewRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;                       // e.g. '/assets/abc'
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  locale: 'en' | 'id';
}
export interface PreviewContext {
  db: Db;
  meId: string;                       // current persona id
  now(): Date;
  newId(prefix: string): string;      // deterministic-per-session counter + random
  emit(e: PreviewEvent): void;        // events/bus
}
export type Handler = (req: PreviewRequest, ctx: PreviewContext) => unknown | Promise<unknown>;
export function route(method: PreviewRequest['method'], pattern: string, h: Handler): void;
export function dispatch(req: Omit<PreviewRequest, 'params'>, ctx: PreviewContext): Promise<unknown>;
// errors.ts
export function notFound(detail?: string): ApiError;     // status 404, code 'http.not_found'
export function badRequest(detail: string): ApiError;     // 400, 'http.bad_request'
export function forbidden(detail?: string): ApiError;     // 403, 'http.forbidden'
// paginate.ts
export function paginate<T extends { id: string }>(items: T[], query: URLSearchParams, limitDefault?: number): { items: T[]; pageInfo: { nextCursor: string | null; hasMore: boolean } };
// index.ts
export function previewFetch<T>(path: string, init: { method?: string; query?: Record<string, unknown>; body?: unknown; locale?: 'en' | 'id' }): Promise<T>;
export function getDb(): Promise<Db>;
export function resetDemo(): Promise<void>;
// test-utils.ts
export function createTestApp(seed?: Partial<Record<CollectionName, Doc[]>>): Promise<{ call<T = unknown>(method: string, path: string, opts?: { query?: Record<string, unknown>; body?: unknown; locale?: 'en'|'id' }): Promise<T>; db: Db }>;
```

Cursor format: opaque base64 of the last returned `id`; `paginate` returns items after that id in the given array order, so callers must sort first with a total order (ties broken by `id`). `previewFetch` serializes query arrays like the real fetcher and returns deep-cloned data (`structuredClone`) so handlers can't leak mutable state into React.

- [ ] **Step 1: Failing tests** (router matching, 404 on unknown route, params extraction, pagination stability)

```ts
// tests/unit/preview/router.test.ts
import { describe, it, expect } from 'vitest';
import { createTestApp } from '@/preview/test-utils';
import { paginate } from '@/preview/router/paginate';
import { ApiError } from '@/lib/api/errors';

describe('router', () => {
  it('unknown endpoint rejects with a 404 ApiError (Review Focus 4)', async () => {
    const app = await createTestApp();
    await expect(app.call('GET', '/nope')).rejects.toSatisfy((e) => ApiError.isApiError(e) && (e as ApiError).status === 404);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: `id${String(i).padStart(2, '0')}` }));
  it('walks all pages without duplicates or gaps', () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const q = new URLSearchParams({ limit: '10', ...(cursor ? { cursor } : {}) });
      const page = paginate(items, q);
      seen.push(...page.items.map((x) => x.id));
      if (!page.pageInfo.hasMore) break;
      cursor = page.pageInfo.nextCursor;
    }
    expect(seen).toEqual(items.map((x) => x.id));
  });
  it('empty list returns empty page', () => {
    expect(paginate([], new URLSearchParams())).toEqual({ items: [], pageInfo: { nextCursor: null, hasMore: false } });
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** the files per the interfaces. `route()` compiles `/assets/{idOrSlug}` or `/assets/:id` patterns into regexes (support both `{x}` and `:x`); first match wins, so register specific routes before parameterized ones. `dispatch` throws `notFound` when nothing matches. `previewFetch` lazily builds the singleton db (`createDb({ seed: createSeedSource(), overlay: createIdbOverlay(), seedVersion: SEED_VERSION })`), registers handlers once (import `./handlers` side-effect index), adds 150–350 ms artificial latency only when `process.env.NEXT_PUBLIC_PREVIEW_LATENCY === '1'` (off in tests/CI), and maps thrown non-ApiError errors to a 500 `ApiError`.

In `fetcher.ts`, inside `apiFetch`, replace the `fetch`-based `doRequest`/401 logic with:

```ts
import { previewFetch } from '@/preview';
export async function apiFetch<T = unknown>(path: string, init: ApiFetchInit = {}): Promise<T> {
  return previewFetch<T>(path, { method: init.method, query: init.query, body: init.body, locale: init.locale });
}
```
Keep exported `ApiFetchInit` (drop `accessToken`/`tokenRefresher` from required use but leave them optional so the 52 call sites keep compiling). Delete `buildUrl`, breadcrumb and retry code. Remove `tests/unit/api-fetcher-retry.test.ts` (its subject no longer exists).

- [ ] **Step 4: Run, expect PASS**; run `pnpm typecheck`.

- [ ] **Step 5: Commit** — `feat(preview): router, pagination and previewFetch dispatch`

---

### Task 4: Session, locale, event bus; remove auth/WS/Sentry/middleware

**Files:**
- Create: `src/preview/session/me-provider.tsx`, `src/preview/events/bus.ts`
- Modify: `src/app/layout.tsx`, `src/lib/api/client.ts`, `src/lib/i18n/request.ts` (delete), `next.config.mjs`, `src/components/navigation/*`, `src/lib/ws/*`, `src/lib/env.public.ts`, `src/lib/env.ts` (delete), `package.json`
- Delete: `src/middleware.ts`, `src/lib/auth/*`, `src/app/api/**`, `src/app/auth/**`, `src/app/health/route.ts`, `src/providers/sentry-provider.tsx`, `src/lib/sentry.ts`, `tests/stubs/next-auth-react.ts`
- Test: `tests/unit/preview/me-provider.test.tsx`

**Interfaces:**
- Consumes: `previewFetch`/`getDb` (Task 3).
- Produces:

```ts
// me-provider.tsx
export function MeProvider({ children }: { children: ReactNode }): JSX.Element;  // loads GET /auth/me, renders children after ready
export function useMe(): MeResponse;                                             // throws outside provider
export function useSession(): { data: { accessToken: 'preview'; user: MeResponse } ; status: 'authenticated' };
// bus.ts
export type PreviewEvent = { type: 'notification'; notificationId: string } | { type: 'version.ready'; assetId: string; versionId: string } | { type: 'assets.changed' };
export const bus: { emit(e: PreviewEvent): void; on(fn: (e: PreviewEvent) => void): () => void };
```

- [ ] **Step 1: Failing test** — `MeProvider` renders children only after `/auth/me` resolves and `useMe().role === 'admin'` (use `createTestApp` seeded with one admin user and mock `@/preview` `previewFetch` to the test app).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Root layout becomes a client-safe shell: `NextIntlClientProvider` fed from a small `LocaleProvider` client component that reads `localStorage['preview.locale']` (default `en`) and imports both `messages/en.json` and `messages/id.json` statically; `QueryProvider`, `MeProvider`, `Toaster` inside. `PATCH /auth/me/locale` handler writes the locale into `me.locale` and `localStorage`; the locale switcher component calls `window.location.reload()` equivalent via state instead of a cookie route. `useAuthedFetch` becomes `useCallback((path, init) => apiFetch(path, { locale, ...init }), [locale])`. `ws-bootstrap.tsx` subscribes to `bus` and invalidates `notifications*` and `asset` keys via `useQueryClient`. Delete all files listed. Remove `next-auth`, `@sentry/nextjs`, `server-only`, `next-intl/plugin` usage from `package.json` / config. Remove `NEXT_PUBLIC_API_URL`/`WS_URL`/auth/Sentry vars from `env.public.ts` (keep `APP_NAME`, `APP_URL` optional default `https://asset.creations.ren`, locale vars, community links).
- [ ] **Step 4: Run** `pnpm typecheck` (expect errors only in server pages — fixed in Task 5) and the new unit test (PASS).
- [ ] **Step 5: Commit** — `feat(preview): fake session, client locale, event bus; remove auth/ws/sentry`

---

### Task 5: Convert server pages to client pages; dynamic routes

**Files (Modify):** every page listed below; layout `src/app/(app)/layout.tsx`; `src/app/not-found.tsx`; `src/preview/router/dynamic-route.ts`
- Pages: `(app)/page.tsx`, `(app)/assets/[idOrSlug]/page.tsx`, `(app)/library/page.tsx`, `(app)/search/page.tsx`, `(app)/profile/page.tsx`, `(app)/notifications/page.tsx`, `(app)/request/page.tsx`, `(app)/publish/page.tsx`, `(app)/publish/new/page.tsx`, `(app)/publish/[id]/page.tsx`, `(app)/publish/[id]/versions/new/page.tsx`, `(app)/publish/manage/page.tsx`, `(app)/publish/manage/[id]/analytics/page.tsx`, `(app)/admin/**` (layout + 14 pages), `(marketing)/**`
- Test: `tests/unit/preview/dynamic-route.test.ts`, Playwright smoke in Task 13

**Interfaces:**
- Consumes: `useMe` (Task 4), `useAuthedFetch`, `queryKeys` (unchanged), `matchDynamicRoute`.
- Produces: `matchDynamicRoute(pathname)` covering `/assets/[idOrSlug]`, `/publish/[id]`, `/publish/[id]/versions/new`, `/publish/manage/[id]/analytics`, `/admin/assets/[id]/edit`, `/admin/reports/[id]`, `/admin/requests/[id]`, `/admin/users/[id]`; every dynamic page exports `generateStaticParams` returning seeded ids/slugs (read from `src/preview/seed-data/*.json` with `fs` at build time) and its body as a client component `XxxPageClient({ id })` that `not-found.tsx` also renders.

Pattern for each converted page (example — asset detail):

```tsx
// src/app/(app)/assets/[idOrSlug]/page.tsx  (server file, only exports params + metadata)
import seed from '@/preview/seed-data/assets.json';
import { AssetDetailPageClient } from '@/components/asset/asset-detail-page-client';
export function generateStaticParams() { return (seed as { slug: string }[]).map((a) => ({ idOrSlug: a.slug })); }
export default function Page({ params }: { params: Promise<{ idOrSlug: string }> }) {
  return <AssetDetailRoute params={params} />;
}
```
with `asset-detail-page-client.tsx`:

```tsx
'use client';
export function AssetDetailPageClient({ idOrSlug }: { idOrSlug: string }) {
  const me = useMe();
  const locale = useLocale() as LocaleCode;
  const fetchApi = useAuthedFetch();
  const q = useQuery({
    queryKey: queryKeys.asset(idOrSlug, locale),
    queryFn: () => fetchApi<AssetDetail>(`/assets/${encodeURIComponent(idOrSlug)}`, { query: { locale } }),
  });
  if (q.isPending) return <AssetDetailSkeleton />;
  if (q.error) return ApiError.isApiError(q.error) && q.error.status === 404 ? <NotFoundView /> : <ErrorView error={q.error} />;
  return <AssetDetailShell asset={q.data} currentUserId={me.id} isAdmin={me.isAdmin} me={me} />;
}
```

- [ ] **Step 1: Failing test** for `matchDynamicRoute` (each route above, trailing slash, encoded characters, non-match returns `null`).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the route table and convert pages one area at a time (public → library/search → publish → admin). For each: remove `requireSession`, `fetchMe`, `getLocale` (use `useLocale`), `cookies()`, `export const dynamic`, `revalidate`; keep query keys; use the existing skeleton as pending UI. `(app)/layout.tsx` drops `requireSession`/`fetchMe` and renders `Navbar` from `useMe()` (make the layout a client component or move the navbar to a client wrapper). `not-found.tsx`: `matchDynamicRoute(usePathname())` → render the matching `...PageClient` by route key; otherwise the 404 view (Review Focus 3).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm lint && pnpm vitest run` (all green except seed-dependent pages which render against an empty catalog until Task 6) and `pnpm build` (must succeed with `output: 'export'`).
- [ ] **Step 5: Commit** — one commit per area: `refactor(preview): client-render <area> pages`.

---

### Task 6: Seed pipeline — source list, thumbnails, generator, integrity tests

**Files:**
- Create: `scripts/seed/prng.ts`, `scripts/seed/assets.yaml`, `scripts/seed/thumbs.ts`, `scripts/seed/build-seed.ts`, `src/preview/seed-data/*.json`, `public/thumbs/*.webp`, `public/thumbs/manifest.json`
- Modify: `package.json` scripts (`seed:thumbs`, `seed:build`)
- Test: `tests/unit/preview/seed-integrity.test.ts`

**Interfaces:**
- Produces seed JSON files, one per `CollectionName`, whose element shapes are the **record types** the handlers consume:
  - `assets.json`: `AssetRecord = AssetDetail-without-computed (isSaved, canEdit, canDelete, canArchive) & { ownerId: string; categoryId: string; licenseId: string; tagIds: string[]; storeName: string; storeUrl: string; titleI18n: {en,id}; shortDescriptionI18n: {en,id}; viewCount: number }`
  - `users.json`: `UserRecord = { id, email, displayName, role, avatar: ServerAvatar, createdAt, locale, isAdmin }`; persona id `u-persona` (admin).
  - `categories.json`, `licenses.json`, `tags.json`, `comments.json`, `notifications.json` (persona's), `requests.json`, `reports.json`, `library.json` (`{ id: assetId, addedAt, hidden }` for persona), `audit.json`, `featured.json`, `devices.json`, `webhooks.json`, `storage.json`, `analytics.json`.
- `assets.yaml` entry shape:

```yaml
- title: "Stylized Fantasy Village"
  short: "Modular low-poly village kit with 120 prefabs."
  category: 3d-models          # one of the 10 category slugs
  engine: UNITY
  tags: [low-poly, fantasy, environment]
  license: commercial
  store: Unity Asset Store
  url: https://assetstore.unity.com/packages/3d/environments/...   # real listing
  image: https://assetstorev1-prd-cdn.unity3d.com/key-image/....jpg # real image URL or page to read og:image from
```

- [ ] **Step 1: Failing integrity test**

```ts
// tests/unit/preview/seed-integrity.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(__dirname, '../../../src/preview/seed-data');
const read = <T,>(n: string) => JSON.parse(fs.readFileSync(path.join(dir, `${n}.json`), 'utf8')) as T;

describe('seed integrity', () => {
  const assets = read<any[]>('assets');
  const cats = read<any[]>('categories');
  it('has at least 100 assets', () => expect(assets.length).toBeGreaterThanOrEqual(100));
  it('populates all 10 categories', () => {
    expect(cats.length).toBe(10);
    for (const c of cats) expect(assets.filter((a) => a.categoryId === c.id).length).toBeGreaterThanOrEqual(5);
  });
  it('every thumbnail file exists and has a store link', () => {
    for (const a of assets) {
      expect(a.storeUrl).toMatch(/^https:\/\//);
      const f = path.resolve(__dirname, '../../../public', a.thumbnail.url.replace(/^\//, ''));
      expect(fs.existsSync(f), a.slug).toBe(true);
    }
  });
  it('has unique ids and slugs and no dangling references', () => {
    expect(new Set(assets.map((a) => a.id)).size).toBe(assets.length);
    expect(new Set(assets.map((a) => a.slug)).size).toBe(assets.length);
    const users = new Set(read<any[]>('users').map((u) => u.id));
    const lic = new Set(read<any[]>('licenses').map((l) => l.id));
    const tags = new Set(read<any[]>('tags').map((t) => t.id));
    for (const a of assets) {
      expect(users.has(a.ownerId)).toBe(true);
      expect(lic.has(a.licenseId)).toBe(true);
      for (const t of a.tagIds) expect(tags.has(t)).toBe(true);
    }
  });
  it('persona owns published assets, has saved items and unread notifications', () => {
    expect(assets.filter((a) => a.ownerId === 'u-persona' && a.status === 'PUBLISHED').length).toBeGreaterThanOrEqual(10);
    expect(read<any[]>('library').length).toBeGreaterThanOrEqual(30);
    expect(read<any[]>('notifications').filter((n) => !n.readAt).length).toBeGreaterThanOrEqual(5);
  });
  it('is deterministic: building twice yields identical output', () => { /* run build-seed into a temp dir twice in the test via child_process and compare hashes */ });
});
```
(The last test must be fully written at execution time: spawn `tsx scripts/seed/build-seed.ts --out <tmp1>` and `--out <tmp2>`, compare file contents.)

- [ ] **Step 2: Run, expect FAIL** (no seed yet).
- [ ] **Step 3: Curate `assets.yaml`.** Use WebFetch / `curl` to find ≥130 real listings across: Unity Asset Store, Fab, Sketchfab, BOOTH, plus itch.io, Kenney, Poly Pizza, OpenGameArt where needed. Rules: ≥12 per category (≥120 across the 10 categories with extras), spread over engines, at least 15 per store for the first four stores where reachable. Use each page's `og:image` (fetch with a browser-like `User-Agent`). Where a store blocks fetching (Fab/BOOTH), try the image CDN URL from search results; if still blocked, replace the entry with another listing and record the substitution in `scripts/seed/SUBSTITUTIONS.md` for the final report.
- [ ] **Step 4: `thumbs.ts`** — for each entry, download the image (retry ×3, 15 s timeout, UA header), resize with sharp to 640×400 `cover` WebP (q 78) → `public/thumbs/<slug>.webp` and 320×200 → `<slug>-sm.webp`, write `manifest.json` mapping slug → `{ file, sourceImage, sourcePage, fetchedAt }`. Skip files that exist. Exit non-zero if fewer than 100 succeeded.
- [ ] **Step 5: `prng.ts` + `build-seed.ts`** — mulberry32 seeded with `0xA55E7`. Generate users (25, persona first), categories (ids `cat-<slug>`, EN/ID names from `backend/scripts/seed.ts`), licenses (same 7 from the backend seed), tags from `assets.yaml`, assets (slug from title via the backend rules: lowercase, hyphenate; versions 1–3 with `semver`, `releaseNotes` TipTap docs, one `.txt` file each named `<slug>-<semver>.txt`, compatibility rows from engine, preview media = thumbnail + 0–2 variants), comments (threaded to depth ≤5, ~3 per asset on average, a few `ISSUE`s with statuses), requests (all statuses), reports (all statuses), notifications for persona (types from `NotificationType`), library for persona, audit entries, featured (5), devices (2), webhook deliveries (30), storage rollups, analytics series (30 days per persona asset, plus platform), one quarantined version for the AV queue, download/save counts consistent with the library. Dates are relative to a fixed anchor `2026-10-01T00:00:00Z`. Accept `--out <dir>` (default `src/preview/seed-data`).
- [ ] **Step 6: Run** `pnpm seed:thumbs && pnpm seed:build && pnpm vitest run tests/unit/preview/seed-integrity.test.ts` → PASS.
- [ ] **Step 7: Commit** — thumbnails and JSON in separate commits: `feat(preview): curated asset list and bundled thumbnails`, `feat(preview): deterministic seed generator`.

---

### Task 7: Handlers — catalog read path (discover, assets list/detail, search, taxonomy, library)

**Files:**
- Create: `src/preview/handlers/{index,helpers,catalog,assets-read,search,library}.ts`
- Test: `tests/unit/preview/handlers-catalog.test.ts`

**Interfaces:**
- Consumes: `route`, `paginate`, `Db`, record types (Task 6), response types from `src/lib/api/types.ts`.
- Produces: `helpers.ts`:

```ts
export function toSummary(a: AssetRecord, ctx: PreviewContext, locale: LocaleCode): Promise<AssetSummary>;
export function toDetail(a: AssetRecord, ctx: PreviewContext, locale: LocaleCode): Promise<AssetDetail>; // resolves owner/category/license/tags, isSaved from library, canEdit/canDelete/canArchive from owner===me or admin
export function sortAssets(items: AssetRecord[], sort: SortOrder): AssetRecord[];                       // total order, id tiebreak
export function visibleTo(a: AssetRecord, meId: string, isAdmin: boolean): boolean;                    // PUBLISHED, or owner/admin
```

| Endpoint | Behavior |
| --- | --- |
| `GET /categories` | `Category[]` with `assetCount` of PUBLISHED assets, names by locale, sorted by `sortOrder` |
| `GET /tags` | `{ items: Tag[] }`-shaped per `types.ts`; `q` prefix filter, `usageCount` desc |
| `GET /licenses`, `GET /licenses/{id}` | localized summaries |
| `GET /discover` | featured slots + one row per category (top 12 by `publishedAt` desc, only non-empty) |
| `GET /assets` | filters: `categoryIds[]`, `engine[]`, `tags[]`, `licenseIds[]`, `ownerId`, `status` (owner/admin only), `sort`, `cursor`, `limit` |
| `GET /assets/{idOrSlug}` | detail by id or slug; 404 when not visible |
| `GET /assets/{id}/recommended` | same category/shared tags, excluding self, max 8 |
| `GET /search/assets`, `GET /search/tags` | tokenized, case/diacritic-insensitive match over title/description/tags (title weight ×3), same filters as `/assets`, facets per `SearchAssetsResponse`; empty `q` returns browse order |
| `GET /library`, `POST /library/items`, `DELETE /library/items/{assetId}`, `PATCH /library/items/{assetId}` | saved items (hide/unhide via `hidden`), `sort`, `hidden`, `q` filters; save/unsave adjusts `totalSaves`; `emit({type:'assets.changed'})` |

- [ ] **Step 1: Failing tests** (examples to write in full at execution, one per row at least):

```ts
it('GET /assets filters by category and paginates without duplicates', async () => {
  const app = await createTestApp(fixtureCatalog(40)); // helper in test-utils: 40 published assets across 2 categories
  const p1 = await app.call<AssetListPage>('GET', '/assets', { query: { categoryIds: ['cat-3d-models'], limit: 10 } });
  expect(p1.items).toHaveLength(10);
  const p2 = await app.call<AssetListPage>('GET', '/assets', { query: { categoryIds: ['cat-3d-models'], limit: 10, cursor: p1.pageInfo.nextCursor! } });
  expect(new Set([...p1.items, ...p2.items].map((i) => i.id)).size).toBe(20);
});
it('save then GET /library shows the item and detail.isSaved is true', async () => { /* POST /library/items {assetId} -> GET /library -> GET /assets/{slug} */ });
it('search ranks title matches above description matches and handles empty q', async () => { /* ... */ });
it('GET /assets/{unknown} is a 404 ApiError', async () => { /* ... */ });
it('draft assets of other users are invisible; own drafts visible', async () => { /* ... */ });
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the handlers and register them via `handlers/index.ts` (imported by `src/preview/index.ts`). Locale: use `titleI18n`/`shortDescriptionI18n` when present for the request locale.
- [ ] **Step 4: Run tests, expect PASS;** run the app in dev (`pnpm dev`) and confirm Discover, Library and Search render real thumbnails.
- [ ] **Step 5: Commit** — `feat(preview): catalog, search and library handlers`

---

### Task 8: Handlers — comments, notifications, local events

**Files:**
- Create: `src/preview/handlers/{comments,notifications}.ts`
- Test: `tests/unit/preview/handlers-social.test.ts`

**Interfaces:**
- Consumes: Task 7 helpers; `bus`.
- Produces: endpoints:

| Endpoint | Behavior |
| --- | --- |
| `GET /assets/{assetId}/comments` | `CommentListResponse`; `kind` filter ALL/COMMENT/ISSUE; nested tree (depth ≤5), deleted comments keep tombstone text per `CommentNode` |
| `POST /assets/{assetId}/comments` | create (parent depth cap 5 → 400), author = persona, content TipTap JSON; notifies asset owner when owner ≠ persona |
| `PATCH /comments/{id}` | author-only edit, sets `editedAt` |
| `DELETE /comments/{id}` | author or admin, soft-delete |
| `PATCH /comments/{id}/status` | issues only; `OPEN → ACKNOWLEDGED → RESOLVED`, owner/admin only |
| `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/read-all` | cursor-paginated, `unreadOnly`; each mutation emits `{type:'notification'}` |

Also add a simulated "reply" mechanism: after the persona posts on an asset **owned by another user**, 6 s later create a notification `COMMENT_REPLY`-style (use the existing `NotificationType` that fits) from the owner and emit the bus event. Timer lives in `ctx` so tests can disable it with `createTestApp({ timers: false })`.

- [ ] **Step 1–5:** failing tests (thread depth cap, edit permissions, issue status transitions, unread-count after read-all, reply notification arrives with fake timers) → implement → green → commit `feat(preview): comments and notifications handlers`.

---

### Task 9: Handlers — publish wizard, versions, uploads, downloads

**Files:**
- Create: `src/preview/handlers/{assets-write,versions,uploads,downloads,analytics}.ts`, `src/preview/uploads/blob-store.ts`
- Test: `tests/unit/preview/handlers-publish.test.ts`

**Interfaces:**
- Produces endpoints: `POST /assets` (draft with slug uniqueness `-2`, `-3`), `PATCH /assets/{id}`, `DELETE /assets/{id}` (soft → `DELETED`), `POST /assets/{id}/publish` (runs the publish checklist: title, description, category, license, ≥1 version with ≥1 file, thumbnail; returns the same problem codes the wizard expects — read `step-review.tsx` and `publish-checklist.service.ts` and mirror them), `/archive`, `/restore`; versions: `GET/POST /assets/{assetId}/versions`, `PATCH …/{vid}`, `POST …/{vid}/publish|reanalyze|compatibility`; uploads: `POST /files/uploads/initiate|complete`, `/files/uploads/multipart/*`, `/files/thumbnails/initiate|complete`, `/files/editor-media/initiate`, `/files/versions/{versionId}/reorder`, `DELETE /files/{fileId}`; `GET /gifs/search` (bundled 12-item set); `POST /downloads`, `GET /downloads/options` (generates `.txt` Blob URL via `URL.createObjectURL` in `getUrl`), `GET /me/analytics/summary`, `GET /me/analytics/assets/{assetId}`.
- Upload model: `initiate` returns `{ uploadId, putUrl: 'preview://<uploadId>' }`; `src/lib/upload/put-with-progress.ts` is changed so URLs with the `preview://` scheme simulate progress over ~600 ms and, for files ≤ 5 MB, store the Blob in `blob-store.ts` (IndexedDB `blobs` store, key = uploadId); larger files store metadata only. `complete` records the `AssetFile` (kind detected from extension) and schedules analysis: after 2 s set the version `analysisStatus: 'READY'`, emit `version.ready` and create a notification.

- [ ] **Step 1–5:** failing tests (create → upload → complete → publish flow end to end; publish checklist failure codes; slug collision; archive/restore toggles `canArchive`; download options produce a text blob URL when `URL.createObjectURL` is stubbed; analysis timer flips to READY with fake timers) → implement → green → commit `feat(preview): publish, version, upload and download handlers`.

---

### Task 10: Handlers — requests, reports, me/profile/devices, users

**Files:**
- Create: `src/preview/handlers/{requests,reports,me,users}.ts`
- Test: `tests/unit/preview/handlers-community.test.ts`

**Interfaces / endpoints:** `POST/GET /asset-requests`, `GET /asset-requests/{id}`; `POST /reports`; `GET /auth/me`, `GET /me`, `PATCH /auth/me/locale`, `GET /auth/plugin/devices`, `DELETE /auth/plugin/devices/{id}`, `POST /me/devices/{id}/revoke`, `POST /me/logout` (no-op returning 204; UI Sign-out button instead triggers `resetDemo` confirmation — see Task 12); `GET /users/search`, `GET /users/{id}` (public profile with their published assets).
- [ ] **Step 1–5:** failing tests (request create validation + listing filters; report create then appears in admin list in Task 11; `/auth/me` `unreadNotifications` matches notifications; locale patch persists; device revoke marks device revoked) → implement → green → commit `feat(preview): requests, reports, profile handlers`.

---

### Task 11: Handlers — admin

**Files:**
- Create: `src/preview/handlers/admin/{dashboard,assets,reports,requests,featured,categories,tags,licenses,users,audit,av,storage,webhooks,analytics}.ts`
- Test: `tests/unit/preview/handlers-admin.test.ts`

**Interfaces / endpoints:** all `/admin/*` routes in the OpenAPI list (`dashboard`, `storage/*`, `assets` CRUD + archive/restore/force-delete/transfer, `reports` list/get/start-review/action/dismiss, `asset-requests` list/patch, `featured` CRUD + reorder + banner-uploads, `categories` CRUD + reorder + icon-uploads, `tags` list/merge/patch/delete, `licenses` CRUD, `users` list/promote/demote, `audit` list/get, `av/*`, `analytics/*`, `queues`, `webhook-deliveries`); plus `GET /admin/users/{id}`, `GET /admin/reports/{id}`, `GET /admin/asset-requests/{id}` if used by pages (check with grep: `src/app/(app)/admin/**/[id]/page.tsx`).
Rules to enforce (and test): featured cap = 5 (400 `featured.cap_reached`); demoting the last admin is refused (409 `users.last_admin`) — the persona is admin and other seeded admins exist, so the test seeds exactly one admin; destructive routes require `confirm` in the body like the real `@RequireConfirmation` (read the admin modals for the exact field); every mutating admin call appends an audit entry; tag merge repoints `tagIds` and sums `usageCount`; category delete refused when it still has assets; dashboard numbers computed from current data.
- [ ] **Step 1–5:** failing tests per rule above → implement → green → commit per sub-area (`feat(preview): admin <area> handlers`).

---

### Task 12: Preview UX — banner, reset, attribution, persistence warning, docs

**Files:**
- Create: `src/components/preview/preview-banner.tsx`, `src/components/preview/attribution-notice.tsx`
- Modify: `src/app/(app)/layout.tsx`, `src/components/layout/footer.tsx`, `src/components/navigation/profile-menu.tsx`, `src/components/asset/asset-meta.tsx` (store link), `README.md`, `CHANGELOG.md`, `messages/en.json`, `messages/id.json`
- Test: `tests/unit/preview/preview-banner.test.tsx`

**Interfaces:**
- Consumes: `resetDemo()`, `getDb().persistent`.
- Produces: `PreviewBanner` (dismissible, dismissal stored in `localStorage['preview.banner.dismissed']`, wrapped in try/catch), profile-menu item "Reset demo data" with a confirm modal that calls `resetDemo()` then `queryClient.clear()` and reloads; one-time toast when `persistent === false`; "Sign out" in the profile menu becomes "Reset demo data"; asset detail "View on {store}" link (`target="_blank" rel="noopener noreferrer"`); footer `AttributionNotice` ("Thumbnails and listings belong to their respective creators and stores and are shown for demonstration. To request removal, contact it@labmgm.org."). Add `en` + `id` strings.
- [ ] **Step 1–5:** failing component test (banner dismiss persists; shows non-persistent warning variant) → implement → green → update README (preview mode, how to regenerate seed, DNS note) and CHANGELOG → commit `feat(preview): banner, reset control, attribution`.

---

### Task 13: Tests — unit cleanup and Playwright smoke against the static export

**Files:**
- Modify: `playwright.config.ts`, `tests/unit/*` that referenced removed modules, `vitest.config.ts` (add `fake-indexeddb/auto` to setup if needed), `package.json` scripts
- Delete: e2e specs requiring the real stack: `02-auth-gate`, `27-logout`, `13-notifications-live`, `29-403-non-admin`, `auth.setup.ts`, `tests/stubs/next-auth-react.ts`; trim the rest to what still applies
- Create: `tests/e2e/preview/{01-boot,02-persistence,03-dynamic-routes,04-locale,05-admin}.spec.ts`

- [ ] **Step 1:** Playwright config: `webServer: { command: 'node scripts/serve-export.mjs out 4173', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI }`, `baseURL: 'http://localhost:4173'`, one Chromium project, no auth setup.
- [ ] **Step 2: Write the specs in full**:

```ts
// tests/e2e/preview/01-boot.spec.ts
import { test, expect } from '@playwright/test';
test('opens straight into the app as the demo admin, no sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page).not.toHaveURL(/signin/);
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.locator('[data-testid="asset-card"]').first()).toBeVisible();
  await page.getByRole('button', { name: /profile|account/i }).click();
  await expect(page.getByText(/admin/i).first()).toBeVisible();
});
// 02-persistence: save an asset -> reload -> still saved; create a comment -> reload -> present;
//                 Reset demo data -> state back to seed.
// 03-dynamic-routes: seeded slug page 200; publish a new asset, open its URL directly via page.goto (hard load) -> renders (Review Focus 3).
// 04-locale: switch to id, reload, UI strings and category names in Indonesian.
// 05-admin: /admin dashboard renders; promote user, audit entry appears; demote-last-admin refused.
```
(Add `data-testid="asset-card"` to `asset-card.tsx` if absent.)
- [ ] **Step 3:** `pnpm build && pnpm test:e2e` → all PASS; `pnpm typecheck && pnpm lint && pnpm test` → PASS.
- [ ] **Step 4: Commit** — `test(preview): unit cleanup and static-export smoke tests`

---

### Task 14: CI/CD to GitHub Pages, deploy, verify

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `.github/workflows/production.yml`, `.github/workflows/staging.yml` (skip web-image job: add `if: false` with a comment pointing to the preview workflow, or delete the job and its needs), `.github/workflows/ci.yml` (frontend job: build with export env; drop `openapi:check` only if it fails for a reason related to this work)

**Interfaces:**
- Produces: workflow with jobs `build` and `deploy`; deployed site; `gh api` Pages configuration.

- [ ] **Step 1: Write `pages.yml`**

```yaml
name: Deploy preview to GitHub Pages
on:
  push:
    branches: [main]
    paths: ['frontend/**', '.github/workflows/pages.yml', 'pnpm-lock.yaml']
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      NEXT_PUBLIC_APP_URL: https://asset.creations.ren
      NEXT_TELEMETRY_DISABLED: '1'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter mgm-asset-library-frontend lint
      - run: pnpm --filter mgm-asset-library-frontend typecheck
      - run: pnpm --filter mgm-asset-library-frontend test
      - run: pnpm --filter mgm-asset-library-frontend build
      - run: |
          echo "asset.creations.ren" > frontend/out/CNAME
          touch frontend/out/.nojekyll
      - run: pnpm --filter mgm-asset-library-frontend exec playwright install --with-deps chromium
      - run: pnpm --filter mgm-asset-library-frontend test:e2e
        env: { CI: 'true' }
      - uses: actions/upload-pages-artifact@v3
        with: { path: frontend/out }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```
(Use the repo's existing pinned action major versions from `ci.yml` where they differ.)

- [ ] **Step 2: Local pre-flight** — `act` is not required; run the exact steps locally: `pnpm install --frozen-lockfile && pnpm build && pnpm test:e2e`.
- [ ] **Step 3: Push branch, open PR, merge when green** — `git push -u origin feat/static-preview`, `gh pr create` (body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`), watch `gh run watch`, merge into `main` when CI is green.
- [ ] **Step 4: Enable Pages** (repo is public, token has `repo` + `workflow`):

```bash
gh api -X POST repos/shirasakaren/asset-library/pages -f build_type=workflow 2>&1 || gh api -X PUT repos/shirasakaren/asset-library/pages -f build_type=workflow
gh api -X PUT repos/shirasakaren/asset-library/pages -f cname=asset.creations.ren -f build_type=workflow
gh workflow run pages.yml --ref main && gh run watch
```
- [ ] **Step 4b: Verify deployment**

```bash
gh api repos/shirasakaren/asset-library/pages --jq '{status,cname,html_url,https_enforced}'
curl -s -o /dev/null -w "%{http_code}\n" --resolve asset.creations.ren:80:185.199.108.153 http://asset.creations.ren/
curl -s --resolve asset.creations.ren:80:185.199.108.153 http://asset.creations.ren/ | grep -i "<title>"
curl -s -o /dev/null -w "%{http_code}\n" --resolve asset.creations.ren:80:185.199.108.153 http://asset.creations.ren/thumbs/manifest.json
nslookup asset.creations.ren
```
Expected: Pages `status: built`; 200 (or 301 → https once DNS+cert exist) with the app `<title>`; manifest 200. Also run Playwright once against `http://asset.creations.ren` with `--host-resolver-rules="MAP asset.creations.ren 185.199.108.153"` if HTTP is served; if GitHub redirects to HTTPS before a cert exists, verify via the `*.github.io` artifact build instead and state that clearly.
- [ ] **Step 5: Report to the user** the exact DNS record required (`CNAME asset → shirasakaren.github.io` on `creations.ren`), that "Enforce HTTPS" can be turned on once DNS resolves (`gh api -X PUT repos/shirasakaren/asset-library/pages -F https_enforced=true`), what was and was not verified, and the substitutions list from Task 6.

---

## Self-Review (done at plan time)

- **Spec coverage:** §1 goals → Tasks 4–7, 12, 14; §3.1–3.4 → Tasks 1–5; §4 persistence → Task 2 (+12 UX); §5 persona/data → Task 6; §6 thumbnails → Task 6, 12; §7 side effects → Tasks 8, 9; §8 CI/CD → Task 14; §9 testing → Tasks 2–13; §10 delivery order matches Task order; §11 risks → Task 1 spike, Task 6 substitutions.
- **Placeholder scan:** handler tasks (7–11) specify endpoints, rules and test cases but leave full test bodies to be written at execution time against the Task 3 harness; the executor must write them in full before implementing (TDD).
- **Type consistency:** `Db`, `SeedSource`, `PreviewContext`, `PreviewRequest`, `route`, `dispatch`, `paginate`, `createTestApp`, `previewFetch`, `getDb`, `resetDemo`, `matchDynamicRoute`, `useMe`, `bus` are defined once (Tasks 1–4) and referenced by the same names afterwards.
- **Review Focus mapping:** (1) Task 2 test "survives a throwing overlay"; (2) Task 2 seedVersion test; (3) Task 5 `not-found` + Task 13 spec 03; (4) Task 3 router test; (5) Tasks 3 & 7 pagination tests; (6) Task 13 spec 04.
