# syntax=docker/dockerfile:1.7
# =============================================================================
# MGM Asset Library — web client image (multi-stage, monorepo).
#
# Build context MUST be the repository root:
#   docker build -f frontend/Dockerfile .
# =============================================================================

# ---------- deps ----------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# Workspace manifests first (both members so the lockfile stays satisfiable).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN pnpm install --frozen-lockfile --filter mgm-asset-library-frontend

# ---------- build ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY backend/package.json ./backend/package.json
COPY frontend ./frontend

# Build-time environment.
# NEXT_PUBLIC_* values are inlined into the client bundle by Next.js and MUST
# be the real production values. Server-only vars are validated by zod at
# module load (src/lib/env.ts), so they must be present and well-formed at
# build time even though the runtime container reads its own env.
ARG NEXT_PUBLIC_APP_NAME="MGM Asset Library"
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_DEFAULT_LOCALE=en
ARG NEXT_PUBLIC_SUPPORTED_LOCALES=en,id
ARG NEXT_PUBLIC_COMMUNITY_DOCS_URL
ARG NEXT_PUBLIC_COMMUNITY_LEARNING_URL
ARG NEXT_PUBLIC_COMMUNITY_HELP_URL
ARG NEXT_PUBLIC_AUTH_MOCK=false
ARG NEXT_PUBLIC_SENTRY_DSN

ARG NEXTAUTH_URL
ARG NEXTAUTH_SECRET
ARG KEYCLOAK_CLIENT_ID
ARG KEYCLOAK_CLIENT_SECRET
ARG KEYCLOAK_ISSUER
ARG KEYCLOAK_LOGOUT_REDIRECT
ARG SENTRY_ENVIRONMENT=production
ARG SENTRY_AUTH_TOKEN

ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_DEFAULT_LOCALE=$NEXT_PUBLIC_DEFAULT_LOCALE \
    NEXT_PUBLIC_SUPPORTED_LOCALES=$NEXT_PUBLIC_SUPPORTED_LOCALES \
    NEXT_PUBLIC_COMMUNITY_DOCS_URL=$NEXT_PUBLIC_COMMUNITY_DOCS_URL \
    NEXT_PUBLIC_COMMUNITY_LEARNING_URL=$NEXT_PUBLIC_COMMUNITY_LEARNING_URL \
    NEXT_PUBLIC_COMMUNITY_HELP_URL=$NEXT_PUBLIC_COMMUNITY_HELP_URL \
    NEXT_PUBLIC_AUTH_MOCK=$NEXT_PUBLIC_AUTH_MOCK \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXTAUTH_URL=$NEXTAUTH_URL \
    NEXTAUTH_SECRET=$NEXTAUTH_SECRET \
    KEYCLOAK_CLIENT_ID=$KEYCLOAK_CLIENT_ID \
    KEYCLOAK_CLIENT_SECRET=$KEYCLOAK_CLIENT_SECRET \
    KEYCLOAK_ISSUER=$KEYCLOAK_ISSUER \
    KEYCLOAK_LOGOUT_REDIRECT=$KEYCLOAK_LOGOUT_REDIRECT \
    SENTRY_ENVIRONMENT=$SENTRY_ENVIRONMENT \
    SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

WORKDIR /app/frontend
RUN pnpm build

# ---------- runtime ----------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
# Copy as the runtime user so Next.js can write its image-optimization cache.
# Without --chown the standalone output lands as root:root and the `node`
# user can't mkdir /app/.next/cache, which broke every <Image> request with
# `EACCES: permission denied, mkdir '/app/.next/cache'`.
COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static ./.next/static
COPY --from=build --chown=node:node /app/frontend/public ./public
RUN mkdir -p /app/.next/cache && chown -R node:node /app/.next
USER node
EXPOSE 3000
CMD ["node", "server.js"]
