# Changelog

All notable changes to the MGM Asset Library are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Static, login-free preview of the web client, deployed to GitHub Pages
  (live at `https://shirasakaren.github.io/asset-library/`; planned final URL
  `asset.creations.ren` once its DNS record exists):
  the backend runs inside the browser (mock API in `frontend/src/preview`,
  rebased JSON seed data, per-visitor IndexedDB overlay and blob store), with
  the demo persona signed in as an admin.
- Preview banner (dismissible), warning banner and one-time toast when browser
  storage is unavailable or full, and **Reset demo data** (profile menu, banner,
  footer).
- Attribution notice with a takedown contact in the footer, and a "View on
  <store>" link to the original listing on asset pages.
- Seed generation scripts (`seed:build`, `seed:thumbs`) and real store
  thumbnails.

### Changed

- `frontend/` no longer talks to the backend or Keycloak; "Sign out" is replaced
  by "Reset demo data". The report button is now shown to admins on other
  users' assets.
- Marketing page CTA reads "Open the preview"; request prices show two decimals;
  the download thank-you message reads correctly; category icons show in the
  admin categories list; the admin dashboard figures no longer clip.

### Removed

- Auth.js / Keycloak sign-in, the API proxy routes and the WebSocket transport
  from the frontend.

### CI/CD

- New `pages.yml` workflow deploys the static preview to GitHub Pages on pushes
  to `main` that touch `frontend/` (lint, typecheck, unit and Playwright e2e
  tests against the export, then `actions/deploy-pages`); `CNAME` is only
  written when a custom domain is set in the Pages settings, and
  `.nojekyll` are written into the export.
- The `frontend` CI job now matches it: static export plus Playwright e2e, and
  no Keycloak/NextAuth build variables.
- The static preview now works both at a host root (custom domain) and under a
  sub-path (`https://shirasakaren.github.io/asset-library/`, the interim public
  URL): every static asset, thumbnail and in-app link honours
  `NEXT_PUBLIC_BASE_PATH`, `serve-export.mjs` can serve `out/` under a prefix
  (`--base`), a base-path smoke suite (`pnpm test:e2e:basepath`) covers the
  sub-path, and `pages.yml` picks the mode from the repository's Pages settings
  (`actions/configure-pages`), building for the root again as soon as a custom
  domain is configured. `ci.yml` exercises both modes on pull requests.
- The web Docker image jobs were removed from `production.yml` and
  `staging.yml` (API and worker images are unchanged); `frontend/Dockerfile` and
  the `web` compose services are kept as legacy references.

## [1.0.0] - 2026-04-30

### Added

- Monorepo packaging: `frontend/` and `backend/` ship from a single pnpm
  workspace with one lockfile, one CI pipeline, and one compose stack.
- Consolidated database migration: the entire schema provisions from a
  single `backend/prisma/migrations/0001_init/migration.sql`.
- Production-ready Docker images for API, worker, and web with monorepo
  build contexts.
- Path-filtered CI jobs so frontend-only PRs no longer rebuild the API.

### Changed

- `fastify` pinned to 4.28.1 to keep the plugin type surface stable.
- OpenAPI sync now resolves the backend spec as a workspace sibling
  (`backend/openapi.json`) instead of a relative repo path.

### Fixed

- Stale Fastify plugin typings after fresh installs.
- Stale `tsbuildinfo` causing phantom typecheck failures.

## [0.9.0] - 2026-04-15

### Added

- Response caching for categories, licenses, and popular tags (Redis).
- Batched S3 presigning in search hits and recommendations.
- Additive indexes for download, comment, and notification hot queries.

### Changed

- WebSocket bearer authentication reuses the HTTP principal cache.

## [0.8.0] - 2026-04-01

### Added

- Frontend code splitting for heavy bundles, link prefetching, and deferred
  WebSocket connect.
- Single client-side saved-IDs hook replacing three server fetches.

### Changed

- Presigned S3 thumbnails bypass the Next.js image optimizer.
- Shared pages moved from `force-dynamic` to `revalidate`.
- Per-domain TanStack Query `staleTime` defaults; SessionProvider polling
  removed.

## [0.7.0] - 2026-03-15

### Added

- Playwright end-to-end suite (30 scenarios) covering the full publish flow,
  admin CRUD, and live notifications.
- Backend e2e harness with in-process FakeKeycloak against the test compose
  stack.
- OpenAPI freshness checks on both sides of the workspace.

## [0.6.0] - 2026-03-01

### Added

- Admin panel: dashboard, moderation, storage rollup, AV queue, audit log.
- Rate limiting on reports, asset requests, comments, and plugin token
  exchange.
- `@RequireConfirmation` guard for destructive admin operations.

## [0.5.0] - 2026-02-14

### Added

- BullMQ worker pipeline: analyzer extractors, ClamAV streaming scans,
  glTF conversion, thumbnail variants, search indexing.
- WebSocket gateway with Redis pub/sub fan-out across replicas.
- Notification system: in-app, email (MJML, en/id), and n8n fan-out.

## [0.4.0] - 2026-01-30

### Added

- Publishing wizard (basics, files, compatibility, media, license, tags,
  review) with AV-warning acknowledgement.
- Versions management with transactional `isLatest` swap.
- Comments and issues with threaded reads, depth cap, and status flow.
- Asset requests with an admin review queue.

## [0.3.0] - 2026-01-15

### Added

- Discover landing page with featured carousel and per-category rows.
- Library and save flows; downloads with signed-URL issuance.
- Meilisearch-backed search with filters and tag autocomplete.

## [0.2.0] - 2025-12-15

### Added

- Keycloak authentication with Auth.js v5 and middleware gating.
- Design system tokens, UI primitives, and the geometric pattern tiles.
- Internationalization (English + Bahasa Indonesia) with locale switcher.

## [0.1.0] - 2025-11-30

### Added

- Asset lifecycle API: create, upload, publish, archive, restore,
  soft-delete, transfer.
- Catalog endpoints for categories, tags, and licenses.
- NestJS foundation: config validation, logging, health endpoints, and the
  Prisma schema.

## [0.0.1] - 2025-10-01

### Added

- Initial monorepo bootstrap: pnpm workspace, CI skeleton, and repository
  scaffolding.
