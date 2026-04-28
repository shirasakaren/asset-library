# MGM Asset Library — Backend production runbook

Operator-facing reference for everything you need to deploy, observe, and
recover the backend. Pair with the README for development setup.

## 1. Architecture

```mermaid
flowchart LR
  Browser([asset.labmgm.org])
  Unity([Unity plugin])
  Unreal([Unreal plugin])
  SWAG[/SWAG nginx + TLS/]
  subgraph "API replicas (PROCESS_ROLE=api)"
    API1[NestJS Fastify]
    API2[NestJS Fastify]
    API3[NestJS Fastify]
  end
  subgraph "Worker replicas (PROCESS_ROLE=worker)"
    W1[NestJS + Blender + ClamAV + ffmpeg]
    W2[NestJS + Blender + ClamAV + ffmpeg]
  end
  PG[(Postgres 16)]
  MO[(MongoDB 7)]
  RD[(Redis 7)]
  MS[(Meilisearch)]
  S3[(S3 / MinIO)]
  KC([Keycloak])
  MT([Mailtrap SMTP])
  N8N([n8n webhook])
  Sentry([Sentry])

  Browser --> SWAG
  Unity --> SWAG
  Unreal --> SWAG
  SWAG --> API1 & API2 & API3
  API1 & API2 & API3 --> PG & MO & RD & MS & S3
  API1 & API2 & API3 --> KC
  W1 & W2 --> PG & MO & RD & MS & S3
  W1 & W2 --> MT & N8N
  API1 & API2 & API3 --> Sentry
  W1 & W2 --> Sentry
  RD -. "ws:fanout pub/sub" .-> API1 & API2 & API3
```

- API replicas are stateless; scale horizontally behind SWAG.
- Workers consume from the shared Redis (BullMQ); cron tasks land on a
  single worker via BullMQ's repeatable-job dedup.
- Postgres + Mongo + Redis + Meilisearch + S3 are managed externally
  (separate compose stacks or managed services).
- Keycloak is owned by the platform team; the backend only verifies tokens.

## 2. First-time provisioning

### 2.1 API host

Plain Linux VM with Docker + Docker Compose:

```bash
sudo apt-get update
