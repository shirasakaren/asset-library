# =============================================================================
# MGM Asset Library — backend API image (multi-stage, monorepo).
#
# Build context MUST be the repository root:
#   docker build -f backend/Dockerfile .
#
# Heavy worker tooling (Blender / ClamAV / ffmpeg) is NOT installed here; the
# worker image (backend/Dockerfile.worker) ships separately with those deps.
# =============================================================================

# ─── 1. Builder ──────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# Workspace manifests first (both members so the lockfile stays satisfiable).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY backend/prisma ./backend/prisma
RUN pnpm install --frozen-lockfile --filter mgm-asset-library-backend

COPY backend/tsconfig*.json backend/nest-cli.json ./backend/
COPY backend/src ./backend/src
COPY backend/scripts ./backend/scripts

RUN pnpm --filter mgm-asset-library-backend prisma generate \
 && pnpm --filter mgm-asset-library-backend build

# NOTE: devDependencies are intentionally kept in the image. `pnpm prune`
# operates on the workspace root project, so a selective production prune is
# not reliable here; the runtime entrypoint only depends on production deps,
# so the extra weight is an accepted trade-off for workspace correctness.

# ─── 2. Runtime ──────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl dumb-init \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/backend/node_modules ./backend/node_modules
COPY --from=builder --chown=node:node /app/backend/dist ./backend/dist
COPY --from=builder --chown=node:node /app/backend/prisma ./backend/prisma
COPY --from=builder --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

USER node
EXPOSE 4000
WORKDIR /app/backend

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT:-4000}/healthz || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
