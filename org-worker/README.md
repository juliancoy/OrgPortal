# Code Collective Org Worker

Cloudflare-native replacement boundary for the org API surface currently used by the Code Collective portal.

## Stack

- Cloudflare Workers
- TypeScript and Hono
- D1 for org/contact/governance/ledger/UBI data
- Cloudflare Scheduled Workers for UBI accrual and payout execution
- PIdP token validation through `PIDP_BASE_URL/auth/me`
- Calendar ingestion protected by the `ORG_INGEST_TOKEN` Worker secret

## Implemented

- `GET /health`
- `GET /admin/me`
- `GET /api/network/contact/me`
- `PUT /api/network/contact/me`
- `POST /api/network/contact/me/import`
- `GET /api/network/contact/:slug`
- `GET /api/network/users/public/:slug`
- `GET /api/network/users/public/:slug/events`
- `GET /api/network/orgs`
- `POST /api/network/orgs`
- `GET /api/network/orgs/:organizationId`
- `PATCH /api/network/orgs/:organizationId`
- `GET /api/network/orgs/public`
- `GET /api/network/orgs/public/:slug`
- `GET /api/network/orgs/public/:slug/events`
- `GET /api/network/events`
- `POST /api/network/events`
- `GET /api/network/events/public`
- `GET /api/network/events/public/:slug`
- `GET /api/governance/motions` and motion detail/action/vote/comment routes
- `GET /api/accounts`, `GET /api/accounts/me`, account automation, transaction history, recent transactions, and transfer creation
- `GET /api/system/money-supply/history`
- `GET /api/system/metrics`
- `GET/PATCH /api/ubi/settings`
- `GET /api/ubi/eligibility`
- Scheduled UBI tick: accrues DENA into `ledger_accounts.dena_balance`, pays whole cents into `balance` on the configured two-week cadence, and records `UBI_PAYMENT` ledger transactions.
- `POST /api/ubi/tick` and `GET /api/ubi/tick-status` for admin-only smoke tests and operations checks.
- `POST /api/network/ingest/calendar` for the existing calendar-generated org/event payload.
- `GET/POST /api/network/scans`, `GET /api/network/scans/:scanId/image`, and `GET/PATCH /api/admin/business-card/settings` for Cloudflare-native business card scan intake, OpenAI OCR extraction, history, image storage, and abuse limits.
- `POST /api/network/chat/bootstrap` returns a clear unavailable response unless Matrix bootstrap is added.
- Unsupported routes return a clear `501` response from this Worker. The Worker no longer falls back to the legacy Arkavo org backend.

## Deploy

Create D1:

```sh
npx wrangler d1 create org
```

Put the returned id into `wrangler.jsonc`, then run:

```sh
npm install
npm run typecheck
npm run db:migrate:remote
npm run deploy
```

Set the root site Worker `ORG_API_ORIGIN` to the deployed Worker URL or custom domain.

The Worker config includes a once-per-minute cron trigger:

```json
"triggers": {
  "crons": ["* * * * *"]
}
```

The cron trigger is only the executor wake-up. UBI administration cadence is controlled by `ubi_runtime_settings.interval_seconds`; production is set to `1209600` seconds, or 2 weeks.

After deploying migrations and the Worker, verify UBI runtime state:

```sh
npx wrangler d1 execute org --remote --command "SELECT * FROM ubi_tick_state;"
curl -i -H "Authorization: Bearer <admin-pidp-token>" https://org-codecollective.jcloiacon.workers.dev/api/ubi/tick-status
```

For a controlled smoke test, trigger one idempotent run with an explicit timestamp:

```sh
curl -i \
  -X POST \
  -H "Authorization: Bearer <admin-pidp-token>" \
  -H "Content-Type: application/json" \
  --data '{"scheduled_time":"2026-06-08T00:00:00.000Z"}' \
  https://org-codecollective.jcloiacon.workers.dev/api/ubi/tick
```

Then confirm `ledger_transactions` includes `UBI_PAYMENT` rows when accrued balances reach whole cents.

Set the ingest token as a Worker secret. Do not store it in `wrangler.jsonc` or pass it as a plain deploy variable.

```sh
npx wrangler secret put ORG_INGEST_TOKEN
```

The root `deploy.sh` can deploy this boundary without rebuilding the whole site:

```sh
./deploy.sh --component org
```

## Calendar ingest

The existing generated calendar feed can be pushed into D1 through the root helper. The helper sends organizations first and events second in small batches, which keeps each Worker invocation inside Cloudflare/D1 API request limits.

```sh
ORG_BACKEND_INGEST_URL=https://codecollective.us/api/org/api/network/ingest/calendar \
ORG_BACKEND_INGEST_TOKEN="$ORG_INGEST_TOKEN" \
python3 scripts/push_org_network_feed.py
```

The endpoint is idempotent by organization source URL and event ingest key, so rerunning the command updates the imported records instead of duplicating them.

## Checks

```sh
npm run typecheck
npm test
```
