# End-to-end tests (Playwright, static export)

These specs run in a real Chromium against the static export in `out/`, the same files that are deployed to GitHub Pages. The app has no server and no login: it boots as the demo admin "Aria Wijaya" on an in-browser mock API (seed JSON + per-visitor IndexedDB overlay + blob store).

## Run

```bash
pnpm build                # writes out/ (NEXT_PUBLIC_APP_URL only affects metadata, any value works)
pnpm test:e2e             # desktop Chromium + the @mobile smoke on a Pixel 7 viewport
pnpm test:e2e:ui          # Playwright UI mode
pnpm lint:e2e             # eslint on tests/e2e and playwright.config.ts (not covered by `pnpm lint`)
pnpm exec playwright test tests/e2e/05-search-filters.spec.ts   # one file
```

`playwright.config.ts` starts `scripts/serve-export.mjs out 4317` itself (an uncommon port on purpose) (it behaves like GitHub Pages: files first, unknown paths answered with `/404.html` and status 404) and reuses a server that is already running locally. Nothing else is needed, no env vars.

Against an already deployed site:

```bash
E2E_BASE_URL=https://asset.creations.ren pnpm test:e2e
```

With `E2E_BASE_URL` set no local server is started and `out/` is not needed. The site must be served at the host root (`https://host/`), not under a sub-path, because the specs navigate to absolute paths like `/admin/`. Reports: `playwright-report/` (HTML, CI only) and `test-results/` (traces and screenshots of failures, both git-ignored). Open a trace with `pnpm exec playwright show-trace test-results/<test>/trace.zip`.

## Conventions

- **Isolation.** Every test gets a fresh browser context, so IndexedDB and localStorage start empty and the test sees the pristine seed. Tests never depend on each other or on order; they mutate freely.
- **Import `test` and `expect` from `./helpers/test`**, not from `@playwright/test`. That `test` adds an automatic guard that fails the test on any uncaught page error, any `console.error`, and any HTTP response with status >= 400 (for example a missing `/thumbs/*.webp`), except the 404 documents a test declares on purpose (see below).
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

## Failure guards and the few tolerated exceptions

- **HTTP and console** (`helpers/test.ts`): every test fails on an uncaught page error, any `console.error`, and ANY response with status >= 400 (document, fetch/xhr, script, stylesheet, image, font, media), on every tab of the test's context. The one exception is opt-in and URL-scoped: a test that loads a browser-created id on purpose declares it, e.g. `test.use(expectNotFound(shellRoute('/publish/:id')))`. Such an id has no HTML file in the export, so the host answers with `/404.html` (status 404) and the client resolves the route; a client-side navigation first fetches the RSC payload (`index.txt`), which 404s the same way, and the browser logs "Failed to load resource ... 404". A declared pattern tolerates the 404 response and that console line for URLs matching it, nothing else; an image that 404s (say `/thumbs/x.webp`) always fails.
- **Accessibility** (`helpers/axe.ts`, `a11y-contrast-baseline.json`): all axe rules are on. `serious`/`critical` violations of any rule except `color-contrast` fail outright (`moderate`/`minor`, such as heading order on card grids, are not enforced). `color-contrast` is compared with a committed per-page baseline: the test fails on a NEW failing node, and also when a baseline node no longer fails, so the file only shrinks. The baseline lists genuine WCAG AA failures caused by design tokens, to be fixed by the design owner in `tailwind.config.ts` / `DESIGN_SYSTEM.md` (they are not page bugs and were deliberately not changed with the tests):

  | Token pair                                      | Ratio (AA needs 4.5:1) | Where                                                         |
  | ----------------------------------------------- | ---------------------- | ------------------------------------------------------------- |
  | brand-blue `#3a6dc5` on brand-blue-50 `#ecf1fa` | 4.43:1                 | "Reset demo data" link, ADMIN pill, version and status badges |
  | white on brand-red `#f94141`                    | 3.58:1                 | notification count, red avatar                                |
  | ink-4 `#9aa1ad` on white                        | 2.6:1                  | "0 chars" helper in the editor                                |

  Others in the baseline: a lighter brand-blue `#4c7aca` on brand-blue-50 (3.74:1, the LATEST tag) and ink-3 `#6b7280` on the tinted dashboard stat cards (green-50, yellow-50, red-50: 4.04 to 4.48:1). Regenerate after an intentional change with `A11Y_UPDATE_BASELINE=1 pnpm exec playwright test 09-a11y --workers=1` and review the diff.

## Adding a test

1. Start from `import { test, expect } from './helpers/test'` and `gotoApp(page, '/path/')`.
2. Prefer roles and labels; pick seed fixtures with `helpers/seed.ts`.
3. Build with `pnpm build` first; the specs run against `out/`, not against `next dev`.
