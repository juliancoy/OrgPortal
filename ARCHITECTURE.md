# OrgPortal Architecture

This document defines the filesystem contract for OrgPortal and the current runtime shape.

## Repository Contract

Top-level layout should remain stable and intentional:

- `web/`: React + Vite frontend application.
- `governance-backend/`: governance API service.
- `org-backend/`: organization/network API service.
- `pidp/`: identity integration service surface.
- `nginx/`: edge/reverse-proxy config and runtime glue.
- `docs/`: architecture, deployment, and requirements documentation.
- `certs/`: local/dev certificate tooling.
- `ubi/`: UBI service surface.
- `run.py` and `docker_utils.py`: local orchestration entrypoints.

## Frontend Contract (`web/`)

The frontend uses layered boundaries:

- `src/domain`: pure domain models and business rules.
- `src/application`: use-cases and ports.
- `src/infrastructure`: adapters (API/auth/storage/platform).
- `src/ui`: routes, views, shell, and components.
- `src/composition`: service wiring and composition root.
- `src/config`: runtime configuration.
- `scripts/`: operational/dev scripts (provisioning, smoke tests).
- `public/`: static assets.

Route-oriented views should live under `src/ui/views/<area>/` (for example `orgs`, `users`, `chat`, `public`).

## Operational Hygiene

- Generated output must stay out of source control (`dist/`, `node_modules/`, local caches, screenshot temp dirs).
- Temporary automation outputs should be placed under `.tmp/` and ignored by git.
- Root and web docs should use current terms (`org`, `user`) while legacy terms are retained only where needed for historical requirements.

## Known Legacy Areas

- Some requirements docs still use historical naming (`campaign`, `constituent`). These are valid as history, but new docs should prefer `org` and `user`.

## Runtime Services (from `run.py`)

- `nginx` (`nginx:latest`)
  - Terminates TLS and routes `/dev`, `/pidp`, `/api/ballot`, `/s3`, `/minio`, and `/spicedb`.
  - Serves static build output from the frontend build pipeline.
- `webapp` (`node:23`)
  - Vite dev server on `:5173` (proxied via nginx `/dev`).
- `webapp_build` (`node:23`)
  - Builds production frontend artifacts.
- `webapp_android_build` (`ghcr.io/cirruslabs/android-sdk:34`)
  - Builds Android APKs via Capacitor/Gradle.
- `PIdP` (`pidp`)
  - Identity/auth service (FastAPI).
- `PIdP Postgres` (`postgres:15-alpine`)
  - Database for PIdP.
- `redis` (`redis:7-alpine`)
  - Ballot backend storage (initiatives, signatures, votes, comments).
- `minio` (`minio/minio:latest`)
  - Object storage (avatars, uploads).
- `spicedb-postgres` (`postgres:15-alpine`)
  - Datastore for SpiceDB.
- `spicedb-migrate` (`authzed/spicedb:latest`)
  - One-shot migration job for SpiceDB.
- `spicedb` (`authzed/spicedb:latest`)
  - Authorization service (relationships/permissions).
- `ballot-backend` (`ballot-backend`)
  - API for initiatives, signatures, votes, comments, admin actions.

## Service Topology (Current Runtime)

```mermaid
flowchart LR
  subgraph Client
    Browser[Browser]
  end

  subgraph Edge
    NGINX[nginx]
  end

  subgraph Web
    WEBAPP[webapp dev (Vite)]
    WEB_BUILD[webapp_build]
    ANDROID[webapp_android_build]
  end

  subgraph Identity
    PIDP[PIdP]
    PIDP_DB[(PIdP Postgres)]
  end

  subgraph Storage
    REDIS[(Redis)]
    MINIO[(MinIO)]
  end

  subgraph AuthZ
    SPICE_DB[(SpiceDB Postgres)]
    SPICE_MIGRATE[spicedb-migrate]
    SPICE[SpiceDB]
  end

  subgraph Backend
    BALLOT[ballot-backend]
  end

  Browser -->|HTTPS| NGINX
  NGINX -->|/dev| WEBAPP
  NGINX -->|/| WEB_BUILD
  NGINX -->|/pidp| PIDP
  NGINX -->|/api/ballot| BALLOT
  NGINX -->|/s3| MINIO
  NGINX -->|/spicedb| SPICE

  WEBAPP --> PIDP
  WEBAPP --> BALLOT

  PIDP --> PIDP_DB
  PIDP --> MINIO

  BALLOT --> REDIS
  BALLOT --> PIDP
  BALLOT --> SPICE

  SPICE --> SPICE_DB
  SPICE_MIGRATE --> SPICE_DB
```
