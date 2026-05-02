# UBI Secure Stack

This folder supports a repeatable, idempotent secure UBI setup on Docker.

It launches:
- `cockroach` (secure TLS mode)
- `ubi` (prod-like)
- `ubi-dev` (dev-like)

## Quick Start

From repo root:

```bash
chmod +x ubi/setup-secure-ubi.sh ubi/teardown-secure-ubi.sh
./ubi/setup-secure-ubi.sh
```

To tear down:

```bash
./ubi/teardown-secure-ubi.sh
```

## Defaults

- Docker network: `arkavo`
- Container names: `cockroach`, `ubi`, `ubi-dev`
- Ports:
  - `cockroach` SQL: `26257`
  - `cockroach` UI: `8081`
  - `ubi`: `8010` -> container `8000`
  - `ubi-dev`: `8011` -> container `8000`

## Environment Overrides

- `NETWORK_NAME` (default `arkavo`)
- `PREFIX` (container prefix)
- `UBI_SECURE_COCKROACH` (default `1`)
- `COCKROACH_IMAGE` (default `cockroachdb/cockroach:v25.1.5`)
- `UBI_PROD_PORT` (default `8010`)
- `UBI_DEV_PORT` (default `8011`)
- `UBI_INTERVAL_SECONDS` (default `60`)
- `UBI_DEV_INTERVAL_SECONDS` (default `15`)
- `DENA_ANNUAL` (default `1`)
- `DENA_PRECISION` (default `6`)
- `UBI_ENTITY_TYPES` (default `individual`)
- `UBI_API_KEY` (default empty)
- `PIDP_BASE_URL` (default `http://pidp:8000`)

## Certificate Notes

Cockroach uses a dedicated internal CA and client/node certs under:

`certs/cockroach/`

These are intentionally separate from nginx edge TLS certs (including Certbot/Let's Encrypt),
because Cockroach SQL mTLS requires database-specific node/client identities and trust roots.
