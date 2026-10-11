# Static Preview Site — Design

Date: 2026-10-09
Status: Approved in conversation; pending written-spec review
Branch: `feat/static-preview`

## 1. Goal and success criteria

Turn the MGM Asset Library frontend into a **public, login-free, fully static
demo** deployed to GitHub Pages at `https://asset.creations.ren`.

Success means:

1. A visitor opens the URL and is already signed in as a fake, active user. No
   sign-in screen exists.
2. The app looks "lived in": the user has published assets, saved assets,
   comments, notifications, pending requests and drafts.
3. The catalog has **at least 100 assets (target ~130)** spread across all 10
   categories and all engines, each with a real thumbnail taken from a public
   digital-asset store listing.
4. Anything the visitor changes (save, comment, publish, edit, admin action,
   locale, etc.) persists **only in that visitor's browser** and survives
   reloads. Nothing is sent to any server.
5. CI builds and deploys to GitHub Pages on push to `main`, and the live
   deployment has been verified to load.

Out of scope: a real backend, real file upload/storage, real authentication,
multi-user interaction, SEO (the site stays `noindex`).

## 2. Decisions already made

| Topic        | Decision                                                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing app | Convert `frontend/` **in place** on a branch, merge to `main`. Backend workspace untouched.                                                                           |
| Hosting      | GitHub Pages from `shirasakaren/asset-library` (public repo), custom domain `asset.creations.ren` (served at site root, no base path).                                |
| Thumbnails   | Taken from real store listings (Unity Asset Store, Fab, Sketchfab, BOOTH, etc.), **downloaded and bundled** in the repo; every asset links back to the original page. |
| Asset files  | Dummy `.txt` files containing the real store link.                                                                                                                    |
| Persona      | Admin user, so the admin panel is demonstrable.                                                                                                                       |

## 3. Architecture

Approach: **mock API inside the app**. `apiFetch` is the single network
boundary; in the preview it dispatches to an in-browser backend instead of
`fetch`. React components, TanStack Query keys and types stay as they are.

### 3.1 Module layout

```
frontend/src/preview/
  store/        seed loader, IndexedDB overlay, merge, reset, seedVersion
  router/       method+path matching, query parsing, ApiError/problem mapping
  handlers/     one file per domain (assets, library, search, discover,
                categories, tags, licenses, comments, notifications,
                requests, reports, downloads, files/uploads, analytics,
                me, users, admin/*)
  session/      MeProvider + stub useSession
  events/       local event bus that replaces the WebSocket
  seed-data/    generated JSON (committed), loaded lazily per domain
frontend/scripts/seed/
  assets.yaml   curated source list
  build-seed.ts deterministic generator -> seed-data/*.json
  fetch-thumbs.ts downloads + resizes thumbnails -> public/thumbs/*.webp
```

Handlers are typed against the existing generated `src/lib/api/schema.ts` and
hand-written `types.ts`, so contract drift fails typecheck.

### 3.2 Removals and changes

- Remove: `next-auth`, `src/middleware.ts`, `src/lib/auth/*`, `app/api/*`,
  `app/auth/*`, `app/health`, Sentry bootstrap, `src/lib/ws/*` transport,
  Keycloak / API / WS env vars, `output: 'standalone'`.
- `next.config.mjs`: `output: 'export'`, `images.unoptimized: true`,
  `trailingSlash: true`, optional `NEXT_PUBLIC_BASE_PATH` (default empty).
  Security headers move out (Pages cannot set them).
- Locale: cookie → `localStorage`, read client-side; `NextIntlClientProvider`
  receives bundled `en`/`id` messages on the client.
- `useAuthedFetch` keeps its signature (52 call sites) and no longer needs a token.

### 3.3 Server pages become client-rendered

About 20 pages currently call `requireSession`, `fetchMe`, `cookies()` or
`apiFetch` on the server. Each becomes a client component that loads through
TanStack Query (same query keys), with the existing skeletons as loading states.
`export const dynamic = 'force-dynamic'` and `revalidate` are removed.

### 3.4 Dynamic routes under static export

Routes such as `/assets/[idOrSlug]`, `/publish/[id]`, `/admin/users/[id]`
need pre-rendering. Plan:

- `generateStaticParams` emits every **seeded** slug/id.
- IDs created by the visitor are unknown at build time. The exported
  `404.html` shell (the `not-found` page, a client component) matches the URL
  against the dynamic route patterns and renders the right client page itself.
- **Risk, verified first (spike, before the rest is built):** that a client
  `not-found` shell can hydrate and render a dynamic page on GitHub Pages and on
  a local static server. Fallback if it fails: query-string routes for
  user-created entities (`/assets/view/?id=…`).

**Outcome (spike result): works, no fallback needed.** Verified against
`scripts/serve-export.mjs` (serves `/404.html` with HTTP 404 for unknown paths,
as GitHub Pages does) with headless Chromium: `/spike/seeded/` returns 200,
`/spike/brand-new-id/` returns 404 and the exported `not-found` shell renders
the client page for `brand-new-id`. Hard load, hard reload and in-app
navigation (`router.push` to an unknown id falls back to a full load of the
404 shell) all work. Two requirements for the `not-found` client component:
(1) read the URL with `usePathname()` and match it with
`matchDynamicRoute()` (`src/preview/router/dynamic-route.ts`);
(2) render a neutral placeholder until hydrated (`useSyncExternalStore` with
server snapshot `false`), because `404.html` is prerendered for
`/_not-found` yet served for any URL, and branching on the real pathname in the
first client render causes hydration error #418. Note the 404 status means
crawlers and the browser network log see a 404 for user-created ids; acceptable
for a demo.

## 4. Persistence

- Seed JSON is immutable and shipped in the build.
- A visitor's state is an **overlay** in IndexedDB: created entities, field
  patches, and tombstones for deletions. Current state = seed + overlay.
- IndexedDB (not localStorage) because publish-wizard media can be large.
  If IndexedDB is unavailable, fall back to in-memory and show a one-time toast
  that changes will not persist.
- `seedVersion` constant: when it changes, the overlay is migrated if trivial
  or reset, with a toast. Prevents stale overlays referencing removed seed ids.
- UI: a dismissible top banner ("Preview — changes are saved only in this
  browser") and a **Reset demo data** item in the profile menu.
- Writes are applied to the overlay and to the in-memory view in one step, and
  relevant query keys are invalidated, as with the real API.

## 5. Persona and data

**Persona:** admin, display name and avatar defined in seed. Owns about 15
published assets plus drafts and an archived one, has 40+ saved assets
(some hidden), 10+ unread notifications, comments and issues on assets, two
pending asset requests, and a registered plugin device.

**Catalog (all generated by `build-seed.ts`, deterministic seeded PRNG so
rebuilds are identical):**

- ~130 assets, 10 categories (the 10 from the backend seed, English + Indonesian
  names), engines Unity / Unreal / Blender / agnostic / audio / image etc.,
  licenses from the backend seed set, 1–3 versions per asset with compatibility
  rows, file lists and release notes (TipTap JSON).
- ~25 fake users, ~150 tags, 5 featured slots, threaded comments and issues
  (depth up to 5), asset requests in every status, reports in every status,
  audit-log entries, storage rollups, analytics time series, webhook
  deliveries, download counts and save counts consistent with the catalog.
- Every asset has `thumbnailUrl` and 1–3 `previewMedia` images where
  available.

## 6. Thumbnails and files

- `assets.yaml` lists, per asset: title, short description, category, engine,
  tags, license, store name, store URL, and the thumbnail source (page whose
  `og:image` / main image is used, or a direct image URL).
- `fetch-thumbs.ts` downloads each image, resizes with `sharp` to 640px-wide
  WebP (plus a small variant for cards), writes to `public/thumbs/`, and
  records the output in a manifest. Expected footprint 5–8 MB.
- Some stores (Fab, BOOTH) are JS-rendered or bot-protected. If an image cannot
  be fetched, that entry is substituted with another listing from the same or a
  similar store and the substitution is reported to the user.
- The "file" of each version is a generated `.txt` (`Original asset page:
<url>`). The download flow builds it as a Blob in the browser.
- Each asset detail page shows "View on <Store>" linking to the original. The
  footer carries a short notice that thumbnails belong to their creators and a
  contact for removal requests. The contact address is an owner decision; the
  default is `it@labmgm.org` unless the owner says otherwise at spec review.

## 7. Simulated side effects

| Real behavior                     | Preview behavior                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Presigned S3 upload + multipart   | Read file locally, simulate progress, store small blobs in IndexedDB, record metadata only for large files. |
| Analyzer / thumbnail jobs         | Timer marks version `READY` after a short delay and emits a notification via the event bus.                 |
| WebSocket notifications           | Event bus feeds the same notification store and bell.                                                       |
| Downloads                         | Generate `.txt` Blob, increment counters in overlay.                                                        |
| Search (Meilisearch)              | In-memory index over seed + overlay: tokenized match, filters, facets, sort, cursor pagination.             |
| GIF search                        | Small bundled set.                                                                                          |
| 3D viewer                         | Kept; no GLBs seeded.                                                                                       |
| Rate limits, idempotency, AV scan | Not simulated, except one seeded quarantined version to show the AV queue.                                  |

## 8. CI/CD

- New `.github/workflows/pages.yml`, on push to `main` (paths: `frontend/**`,
  workflow file) and `workflow_dispatch`: install with pnpm, lint, typecheck,
  unit tests, `next build` (static export), write `CNAME`
  (`asset.creations.ren`) and `.nojekyll` into `out/`, run the Playwright
  smoke test against `out/`, `actions/upload-pages-artifact`, then
  `actions/deploy-pages`. Permissions: `pages: write`, `id-token: write`.
- `production.yml` / `staging.yml`: gate or remove the web-image job (it would
  build an app that no longer exists). Backend jobs stay.
- Enable Pages (source: GitHub Actions) and set the custom domain through the
  `gh` CLI.
- **User action required:** DNS `CNAME` record `asset` → `shirasakaren.github.io`
  on `creations.ren`. After it propagates, enable "Enforce HTTPS".
- **Verification:** (a) Playwright against `out/` locally and in CI;
  (b) after deploy, check the Pages API status and request the site directly
  at GitHub's Pages IP with `Host: asset.creations.ren`
  (works before DNS); (c) once DNS exists, load the real domain.

## 9. Testing

- Vitest unit tests: store merge/tombstones/reset, router matching, each
  handler's filter/sort/pagination, seed integrity (≥100 assets, every category
  populated, all thumbnail files exist, no dangling ids).
- Existing component unit tests kept and updated where auth stubs change.
- Playwright (against the static export): demo user is signed in with no auth
  screen; library shows saved items; save/unsave persists across reload;
  creating and editing an asset persists across reload; reset restores seed;
  dynamic seeded and user-created routes both render; both locales render.
- Remove e2e specs that require the real stack: auth gate, logout, live
  WebSocket notifications, and any that depend on Keycloak or the API.

## 10. Delivery order

1. Spike: static export + dynamic-route shell (§3.4) proven.
2. `apiFetch` mock router + store + persistence + MeProvider; app boots signed-in.
3. Convert server pages to client pages; remove auth/WS/Sentry/middleware.
4. Seed generator + thumbnail pipeline; catalog of ≥100 assets.
5. Handlers by domain: discover/assets/search/library → comments/notifications
   → publish wizard/uploads → requests/reports → admin.
6. Banner, reset control, attribution notice, README/CHANGELOG.
7. Tests, CI workflow, enable Pages, deploy, verify.

## 11. Risks

- Dynamic routes under static export (spike first, fallback defined).
- Store images blocked or removed (substitution rule, bundled copies prevent
  later breakage). Third-party images in a public repo may draw takedown
  requests; mitigated by credit, links and a removal contact, and accepted by
  the owner.
- Large conversion surface (~20 pages, ~100 endpoints); mitigated by keeping
  query keys and component props unchanged so handlers can be added domain by
  domain with typecheck as the guard.
- Bundle size of seed JSON; mitigated by per-domain lazy loading.
