# End-to-end tests (Playwright, static export)

These specs run in a real Chromium against the static export in `out/`, the same files that are deployed to GitHub Pages. The app has no server and no login: it boots as the demo admin "Aria Wijaya" on an in-browser mock API (seed JSON + per-visitor IndexedDB overlay + blob store).

## Run

```bash
pnpm build                # NEXT_PUBLIC_APP_URL=http://localhost:4173 pnpm build  (writes out/)
pnpm test:e2e             # desktop Chromium + the @mobile smoke on a Pixel 7 viewport
pnpm test:e2e:ui          # Playwright UI mode
pnpm exec playwright test tests/e2e/05-search-filters.spec.ts   # one file
```

`playwright.config.ts` starts `scripts/serve-export.mjs out 4173` itself (it behaves like GitHub Pages: files first, unknown paths answered with `/404.html` and status 404) and reuses a server that is already running locally. Nothing else is needed, no env vars.

Against an already deployed site:

```bash
E2E_BASE_URL=https://asset.creations.ren pnpm test:e2e
```

(The local server still starts but is unused.) Reports: `playwright-report/` (HTML, CI only) and `test-results/` (traces and screenshots of failures, both git-ignored). Open a trace with `pnpm exec playwright show-trace test-results/<test>/trace.zip`.

## Conventions

- **Isolation.** Every test gets a fresh browser context, so IndexedDB and localStorage start empty and the test sees the pristine seed. Tests never depend on each other or on order; they mutate freely.
- **Import `test` and `expect` from `./helpers/test`**, not from `@playwright/test`. That `test` adds an automatic guard that fails the test on any uncaught page error, any `console.error` outside the allowlist below, and any failed image/script/stylesheet/font request (for example a missing `/thumbs/*.webp`).
- **Helpers.** `helpers/app.ts` (`gotoApp` waits for the app shell, not the loading skeleton, and dismisses nothing; profile menu, save, comment helpers), `helpers/publish.ts` (create a draft, wizard steps), `helpers/files.ts` (a real PNG and a deterministic package generated in memory), `helpers/seed.ts` (reads the seed JSON so tests pick fixtures instead of hard-coding titles), `helpers/axe.ts`.
- **Selectors.** Roles, labels and visible text. No `data-testid` was added to components; the only one in the app (`preview-banner`) pre-existed.
- **No fixed sleeps.** Use web-first assertions, `expect(...).toPass()`, or `page.clock` (the carousel tests jump past the 5 s rotation instead of waiting). The one real wait is the simulated owner reply (about 6 s) in `06-social`, asserted with a 15 s timeout.
- **Language.** Specs run in English; `10-motion-locale` and `02-persistence` switch to Indonesian on purpose.
- **Mobile.** A test is routed to the Pixel 7 project by putting `@mobile` in its title; the desktop project skips those.

## Specs

| File                  | What it covers                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-boot`             | opens as the admin persona without any sign-in screen, banner, profile menu and role, 8+ cards with decoded thumbnails, footer attribution and `mailto:`, `noindex`                      |
| `02-persistence`      | save, comment and locale survive a reload; "Reset demo data" restores the seed (comment and saved item gone, banner back, language kept by design)                                       |
| `03-dynamic-routes`   | seeded pages are pre-rendered (200); a draft created in the browser opens on a hard load through the 404 shell (status 404, app renders); real 404s; admin user page in the admin chrome |
| `04-publish-flow`     | the flagship: draft, thumbnail, file, description, compatibility, tags, publish, download (name and bytes), reload, manage list, analytics; plus the blocked checklist                   |
| `05-search-filters`   | typeahead and results, empty state, category and engine filters in the URL, sort, infinite scroll, a Japanese original title                                                             |
| `06-social`           | the simulated owner reply with the bell count, notifications read and mark all read                                                                                                      |
| `07-admin-content`    | dashboard, archive and restore, featured cap and reorder, categories, tag merge                                                                                                          |
| `08-admin-people-ops` | promote and demote, self-demote and last-admin protection, audit rows, report and request decisions, every admin page loads                                                              |
| `09-a11y`             | axe on home, asset detail, library, search and the admin dashboard                                                                                                                       |
| `10-motion-locale`    | `prefers-reduced-motion` stops the carousel autoplay; Indonesian on key pages                                                                                                            |
| `11-mobile`           | `@mobile`: home, banner versus navbar, no horizontal scroll, profile menu, asset page                                                                                                    |

## Allowlists (and why)

- **Console errors** (`helpers/test.ts`): only `Failed to load resource ... 404`. A browser-created id (`/publish/<id>/`) has no HTML file in the export, so the host answers the document request with `/404.html` and status 404 and the client resolves the route; the browser logs that 404. It is the mechanism, not a bug. 404s of images, scripts, styles and fonts are still failures.
- **axe rules** (`helpers/axe.ts`): only `color-contrast`, on `serious`/`critical` findings. The brand palette misses WCAG AA by small margins in a few places (brand-blue text on brand-blue-50 is 4.43:1, white on brand-red 3.58:1, ink-3 on tinted cards 4.04 to 4.48:1, ink-4 helper text 2.6:1). Those are shared design tokens, not page bugs; changing them is a product-wide design decision. Everything else (ARIA attributes, unlabeled controls, ...) must pass. `moderate` and `minor` findings such as heading order on card grids are not enforced.

## Adding a test

1. Start from `import { test, expect } from './helpers/test'` and `gotoApp(page, '/path/')`.
2. Prefer roles and labels; pick seed fixtures with `helpers/seed.ts`.
3. Build with `pnpm build` first; the specs run against `out/`, not against `next dev`.
