# Changelog

All notable changes to the MGM Asset Library are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
