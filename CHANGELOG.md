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
