# MGM Asset Library

A centralized, internal digital asset library for the MGM research lab and its
partners — think "Unity Asset Store, but private". Teams share `.unitypackage`
files, `.uplugin` modules, full Unreal projects, 2D/3D models, VFX, audio,
animations, tools, and scripts with a web UI at
[`asset.labmgm.org`](https://asset.labmgm.org) and an API at
[`asset-api.labmgm.org`](https://asset-api.labmgm.org).

This repository is a **monorepo** containing the two server-side pieces of the
platform:

| Workspace member                | Purpose                                                                    |
| ------------------------------- | -------------------------------------------------------------------------- |
| [`frontend/`](./frontend)       | Next.js 15 web client served at `asset.labmgm.org`.                        |
| [`backend/`](./backend)         | NestJS REST API, BullMQ workers, database, search, and file pipeline.      |

Two companion repositories hold the editor integrations and live outside this
monorepo: `mgm-asset-library-unity` (Unity editor plugin) and
`mgm-asset-library-unreal` (Unreal editor plugin). They talk to the same API
through plugin device tokens.

## Overview

- **Full asset lifecycle** — create drafts, upload files (single-shot and
  multipart presigned S3 uploads), publish, archive, restore, soft-delete,
  and transfer ownership. Versions carry an engine compatibility matrix and
  an `isLatest` flag swapped transactionally.
- **Catalog + discovery** — categories, tags, licenses, filtered listing
  with cursor pagination, a composite `/discover` landing payload, featured
  slots (capped at 5), recommendations, and Meilisearch-backed search with
  fuzzy tag autocomplete.
- **File analysis pipeline** — BullMQ workers extract metadata from
  `.unitypackage`, `.uplugin`, `.uproject`, FBX/OBJ/GLTF/BLEND, images,
  audio/video, code, and archives. Per-file jobs fan in through a Redis
  counter into the version rollup that writes the manifest, flips status,
  and triggers conversion + reindex.
- **Safety** — ClamAV INSTREAM scanning (500 MB streaming cap) with
  quarantine flows, publish checklist with AV-warning acknowledgement,
  rate limiting on abuse-prone surfaces, and a `@RequireConfirmation` guard
  on destructive admin operations.
- **glTF conversion & thumbnails** — Blender → glTF-pipeline → `gltfpack`
  derived web-viewer outputs, plus six WebP thumbnail variants and a
  headless Eevee auto-render for 3D previews.
- **Notifications** — 13 typed event payloads delivered in-app, over a
  WebSocket gateway (`/ws`, with Redis pub/sub fan-out across replicas),
  by MJML email (en/id), and through an n8n webhook bus.
- **Community features** — threaded comments and issues (depth-5 cap, Lite
  TipTap validation), asset requests with an admin review queue, and a
  report system with atomic admin actions.
- **Admin panel** — dashboard, storage rollup, moderation, featured
  management, categories/tags/licenses CRUD, user promotion with a
  last-admin guard, audit log, AV queue, Bull Board, and Prometheus metrics.
- **Ops hardening** — locked-down CSP, HSTS, request-ID correlation,
  structured Pino logging, Sentry, health endpoints (`/healthz`, `/readyz`),
  and a production [runbook](./backend/docs/RUNBOOK.md).

```mermaid
flowchart TB
  subgraph Clients
    Web[Next.js web client]
    Unity[Unity plugin]
    Unreal[Unreal plugin]
  end
  subgraph "Monorepo"
    FE[frontend/ — Next.js 15 · Auth.js · TanStack Query · Tailwind]
    API[backend/ api role — NestJS Fastify · Prisma · Mongo · S3 · Meili]
    WRK[backend/ worker role — BullMQ · Blender · ClamAV · ffmpeg]
    DB[(Postgres 16)]
    MO[(MongoDB 7)]
    RD[(Redis 7)]
    MS[(Meilisearch)]
    S3[(S3 / MinIO)]
  end
  KC[Keycloak]
  Web --> FE
  Unity --> API
  Unreal --> API
  FE --> API
  API --> DB & MO & RD & MS & S3
  WRK --> DB & MO & RD & MS & S3
  API --> KC
  FE --> KC
  RD -. "ws:fanout pub/sub" .-> API
```

The API process is split by `PROCESS_ROLE` (`api` | `worker`): API replicas
only enqueue BullMQ jobs while worker replicas run every processor and the
cron maintenance tasks. Two backend images (`backend/Dockerfile` and
`backend/Dockerfile.worker`) ship accordingly.

---

## Repository layout

```
.
├── backend/                  # NestJS API + workers (workspace member)
│   ├── prisma/               # schema.prisma + consolidated migration script
│   ├── scripts/              # seed, reindex, openapi export, ops helpers
│   ├── src/                  # modules, infra, common, config
│   ├── test/                 # unit, integration, and e2e suites
│   └── docs/RUNBOOK.md       # production operations reference
├── frontend/                 # Next.js 15 web client (workspace member)
│   ├── src/app/              # App Router pages and API routes
│   ├── src/components/       # ui, asset, admin, publish, navigation, …
│   ├── messages/             # i18n catalogs (en, id)
│   ├── tests/                # unit + Playwright e2e suites
│   └── DESIGN_SYSTEM.md      # design tokens and primitive specs
├── .github/workflows/        # CI, staging CD, production CD
├── docker-compose.yml        # local full stack (infra + api + worker + web)
├── docker-compose.prod.yml   # production images stack
├── WS_PROTOCOL.md            # WebSocket gateway protocol (shared)
└── package.json              # pnpm workspace root
```

---

## 1. Prerequisites

### 1.1 Development workstation

| Tool  | Version                                             |
| ----- | --------------------------------------------------- |
| Node  | ≥ 20                                                |
| pnpm  | 9.x (corepack picks the pinned version from `packageManager`) |
| Docker | ≥ 24 with Compose v2 (for the local stack)         |
| Git   | ≥ 2.40                                              |

### 1.2 External services

The local `docker compose` stack provisions Postgres, MongoDB, Redis,
Meilisearch, and MinIO for development. In staging/production these are
managed externally. **Keycloak** is always external — the platform team
operates the realm; both apps only consume
`KEYCLOAK_ISSUER_URL` / `KEYCLOAK_JWKS_URI` / client credentials. Mailtrap
SMTP and an n8n webhook are optional outbound integrations.

---

## 2. Getting started

```bash
git clone git@github.com:MGM-Laboratory/mgm-asset-library.git
cd mgm-asset-library

# 1) Environment files (defaults match docker-compose.yml)
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

# 2) Install the workspace (single lockfile at the repo root)
pnpm install

# 3) Start the infrastructure + all three containers
docker compose up -d --build

# 4) Apply the database migration and seed reference data
pnpm db:migrate:dev      # prisma migrate dev — applies migrations/generates client
pnpm db:seed             # bootstrap admin, categories, licenses

# 5) Run the apps on the host (or use the compose containers)
pnpm dev                 # API on :4000 and web on :3000 in parallel
```

Then:

- Web client — `http://localhost:3000` (public `/about` only; everything
  else requires sign-in)
- API — `http://localhost:4000`
- Swagger UI — `http://localhost:4000/docs`
- Liveness / readiness — `GET /healthz`, `GET /readyz`
- Worker health & metrics — `http://localhost:4001` (`/healthz`, `/metrics`)
- Bull Board — `GET /admin/queues` (admin-only)
- Primitive playground — `/dev/components` (non-production builds)

Without a running Keycloak, set `NEXT_PUBLIC_AUTH_MOCK=true` in
`frontend/.env.local` to synthesize an admin session for offline
development. **The runtime refuses this flag when `NODE_ENV=production`.**

### MinIO local buckets

The MinIO container starts empty. Create the configured buckets once:

```bash
docker run --rm --network host minio/mc \
  alias set local http://localhost:9000 mgm mgm-secret
docker run --rm --network host minio/mc \
  mb -p local/mgm-asset-library-assets local/mgm-asset-library-thumbs local/mgm-asset-library-editor
```

---

## 3. Database migrations & seeding

The schema is managed through `backend/prisma/schema.prisma`, and the whole
database is created by **one consolidated migration script** shipped at
`backend/prisma/migrations/0001_init/migration.sql`. There is no per-feature
migration sprawl — a fresh environment is one `migrate deploy` away from a
fully provisioned schema (28 tables, all enums, indexes, and foreign keys).

| Command                    | Use                                                              |
| -------------------------- | ---------------------------------------------------------------- |
| `pnpm db:migrate`          | `prisma migrate deploy` — apply pending migrations (CI/prod boot) |
| `pnpm db:migrate:dev`      | `prisma migrate dev` — create + apply a new migration locally    |
| `pnpm db:generate`         | Regenerate the Prisma client                                     |
| `pnpm db:seed`             | Idempotent bootstrap: admin user, categories, licenses           |
| `pnpm db:studio`           | Prisma Studio                                                    |

The production API image runs `prisma migrate deploy` automatically on
container start, before the HTTP server binds — deploys are migration-safe
by default. Migrations are forward-only; see the
[runbook](./backend/docs/RUNBOOK.md) for the emergency rollback procedure.

`pnpm db:seed` upserts a bootstrap admin keyed on `ADMIN_BOOTSTRAP_EMAIL`
(the `keycloakSub` is a placeholder overwritten on first real login), ten
default categories with en/id labels, and seven license templates. Running
it repeatedly is safe.

---

## 4. Frontend guide

### 4.1 Auth

Authentication is delegated to Keycloak via Auth.js v5:

- Sign-in redirects through `/auth/signin` to Keycloak's hosted login.
- `frontend/src/middleware.ts` gates every route except the public
  allowlist (`/about`, `/auth/*`, `/api/auth/*`, `/_next/*`, `/brand/*`,
  `/patterns/*`, `/favicon*`, `/robots.txt`, `/sitemap.xml`, `/403`).
- Server helpers live in `frontend/src/lib/auth/server.ts`:
  `getSession()`, `requireSession(callbackUrl?)`, `fetchMe(session)`,
