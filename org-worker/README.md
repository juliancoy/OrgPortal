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
- `GET /version`
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
- `GET /api/timebank`, `POST /api/timebank/listings`, `PATCH /api/timebank/listings/:id`, `POST /api/timebank/exchanges`, and `PATCH /api/timebank/exchanges/:id`
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

## Timebanking

The portal's `/timebanking` tab uses separate `timebank_members`, `timebank_listings`, and `timebank_exchanges` tables. Apply the timebank migrations through `0024_timebank_listing_visibility.sql` before releasing the Worker and portal changes. Public listings can be browsed without signing in; member data and mutations require a PIdP bearer token. The portal reaches these routes through `/api/org/api/timebank`.

Members post an `offer` or `request` with a title, description, optional location, and estimated minutes. The owner can close or reopen a listing. Another member records completed work using the listing ID, actual minutes, and a note. The listing determines who provided and received the help. The listing owner confirms or declines; the submitter can cancel pending hours. Closing a listing prevents new exchanges while allowing existing exchanges to settle.

Confirmed exchanges form the hours ledger. Each credits the provider and debits the recipient equally. Balances start at zero, allow negatives, and are calculated from all confirmed exchanges. No Dena accounts, transfers, UBI accrual, or currency conversions participate. Durations are stored as integer minutes in 15-minute increments, from 15 minutes to 24 hours per listing or exchange.

Creation requests include a client-generated UUID `id` for safe retries. Listing status accepts `open` or `closed`; exchange status accepts `confirmed`, `declined`, or `canceled`. Resolved exchanges cannot be changed. The dashboard returns the latest 200 visible listings and 100 personal exchanges (pending first), plus lifetime earned, spent, and balance totals in minutes.

`npm test` covers the real migration, accounting, permissions, retries, and HTTP authentication. From `../web`, `npm run test:timebank:selenium` exercises desktop and mobile browsers against the production Worker routes with a local SQLite adapter and test identity provider (setup below). These browser tests use Node 24 and require the org-worker dependencies installed.

## Deploy

### Identify the running source

`/health` retains `ok` and `service`, and adds `commit` (full OrgPortal Git SHA),
`dirty` (whether the build checkout had local changes), `builtAt` (UTC build time),
and `workerVersionId` (Cloudflare's version ID, distinct from a Git SHA).
`/version` returns the same metadata without `ok`. Both send `Cache-Control: no-store`.
Through the existing edge proxy, use `/api/org/health` or `/api/org/version`.

Wrangler's custom build automatically runs `npm run build:metadata`, including
when invoked directly with `npx wrangler deploy` or `wrangler versions upload`.
The generated module is bundled into the Worker; no database or Git lookup happens
on requests. It reads OrgPortal's own checkout, including when used as a submodule,
so a parent site's GitHub SHA cannot be mistaken for the OrgPortal revision.
Source archives can supply `ORGPORTAL_BUILD_COMMIT` as an explicit full SHA.
Without Git history or that setting, `commit` and `dirty` are `null`; the endpoint
never invents a revision. An archive's `dirty` value remains unknown (`null`).

`npm run typecheck`, `npm test`, and `npm run check:bundle` generate the module
automatically. For custom build/test commands, run `npm run build:metadata` first.
Do not use Wrangler's `--no-bundle`/`--no-build` shortcuts to bypass this build step.
The source change must be deployed before live health responses include these fields.

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

## Email campaigns

The portal's `/email` page manages Google Workspace campaigns. Registrations support separate event-update and organization-announcement subscriptions. The existing minute cron drains a durable D1 email outbox alongside the independent UBI task.

Follow [the Google Workspace setup and deployment guide](../docs/deployment/email-campaigns.md) before enabling sending. Sender OAuth secrets, migration `0019_email_campaigns.sql`, and the frontend org API proxy are required. Sending defaults to disabled.

## Checks

```sh
npm run typecheck
npm test
```

### Timebank communities and photos

`0021_timebank_communities_images.sql` creates the central timebank and
`bmoretimebank.codecollective.us`. The site Worker forwards the incoming hostname;
all listing, exchange, balance and photo operations resolve that hostname to a
community. Unknown hosts return 404. Communities are open to the shared portal's
signed-in members. Identity, People, Chat, Calendar and Dena remain shared portal
services; this is isolation of timebank data, not a separate identity system.

Sysadmins can change the community name, welcome message and accent from
**Timebank → Community settings**, or create another community there. Connect
its generated `<slug>.codecollective.us` hostname to the existing
`codecollective-site` Worker in Cloudflare (a proxied DNS record plus an exact
Worker route, or a Worker Custom Domain). The subdomain root opens `/p/timebanking`.
OAuth uses the already trusted central callback, resolves the destination from
community records, and returns using the existing shared-domain session cookie.
No separate frontend build or identity-provider callback registration is needed.

Listing images use the existing `SCAN_IMAGES` R2 binding in the `timebank/`
namespace. Owners can add, replace or remove JPEG/PNG/WebP photos up to 5 MB.
The browser re-encodes photos at at most 1600 px to remove embedded metadata.
Public, open listing images are readable by URL within their community. Other
listing images require a bearer token and are loaded as blobs by the portal.
Photo responses use `private, no-store` so visibility is rechecked on each read.
A failed photo upload leaves
the listing saved and offers a retry; the owner can also add its photo later.

Run the Selenium acceptance suite with a fresh local fixture (restart between
runs). It drives actual form fields, file upload, filters, dialogs, confirmations
and community settings, with the production Worker routes and SQLite ledger.
Use Node 24+ and install dependencies in `org-worker`, `chat-worker`, and `web`.
The Chrome container needs at least three concurrent sessions for the public
visibility suite (`SE_NODE_MAX_SESSIONS=5` and `SE_NODE_OVERRIDE_MAX_SESSIONS=true`):

```sh
# In org-worker:
TIMEBANK_TEST_PORT=8794 node --import tsx test/helpers/timebankServer.ts
# In web, a second terminal:
VITE_CACHE_DIR=/tmp/timebank-vite VITE_ALLOWED_HOSTS=codecollective.us,bmoretimebank.codecollective.us VITE_PUBLIC_BASE=/p/ VITE_HMR_HOST=bmoretimebank.codecollective.us VITE_HMR_PROTOCOL=ws VITE_HMR_CLIENT_PORT=5179 PIDP_PROXY_ORIGIN=http://127.0.0.1:8794 ORG_API_ORIGIN=http://127.0.0.1:8794 npm run dev -- --host 0.0.0.0 --port 5179 --strictPort
# Chrome in Docker on port 4446; browser maps the two test hosts to 172.17.0.1.
npm run test:timebank:selenium
```

Screenshots default to `/tmp/timebank-selenium-after`. Only external identity and
R2 storage are fixture adapters; the timebank HTTP routes and SQL are real.

### Request uptake and administrator analytics

Apply `0022_timebank_uptake.sql`. Members can take up another member's open
request (`PUT /api/timebank/listings/:id/uptake`) or withdraw their commitment
(`DELETE` on the same route). This never transfers hours. Uptake counts distinct
current volunteers plus providers of confirmed help; multiple exchanges by the
same person count once, and completed help remains counted after withdrawal.

`GET /api/timebank?request_sort=most|least|newest` sorts requests before limiting
the board to 200 listings per column. Offers stay newest first.

`GET /api/timebank/analytics` requires a system administrator and reports only
the hostname's community, over the complete confirmed ledger:

- Circulation: sum of positive net member balances (outstanding credits).
- Rewarded hours: sum of confirmed exchange durations, each counted once.
- Category pie: rewarded hours grouped by the listing category.
- Beneficiaries: top ten recipients by confirmed hours received.
- Providers: top ten members by confirmed hours provided.

Pending, declined and canceled exchanges never contribute to these metrics.
The timebank home is a dedicated Offers/Requests board; My hours and Admin are
separate views. General portal navigation and promotional panels are omitted.

### Public homepage and listing visibility

`0024_timebank_listing_visibility.sql` adds `visibility: public | members`, with
`public` as the default for existing and new offers and requests. Owners choose
**Public** or **Members only** in the composer and can change it in listing details
using `PATCH /api/timebank/listings/:id` with `{ "visibility": "members" }`.
Visibility covers the listing text, details and photos.

The community homepage opens without a login wall and shows public, open listings
from all authors. Signed-in members see all open listings in their community.
**My listings** is an explicit filter; publishing or returning Home restores the
community view. Guests must sign in to post, message, take up requests or exchange
hours. Public dashboard responses include no account or exchange history.
Closed listings are available to signed-in members through their detail links.

The Code Collective website's **Community offers** section uses
`GET /api/timebank/public-offers` through the existing `/api/org` proxy. This public
feed reads open, public offers from every timebank community and includes the
original community's listing and photo URLs. It never includes member-only
listings or account data, even for signed-in visitors. Pages contain 12 offers,
newest first; use `before=<next_cursor>` to load more. The website's **Show more
offers** button follows that cursor. Closing an offer or making it members-only
removes it from subsequent public reads.

Run `npm run test:timebank:public:selenium` from `web` with the same fresh fixture
and Vite setup above and a Selenium container configured for three sessions.
It checks multiple authors, public defaults, restricted photos, visibility changes,
desktop/mobile browsing, Home filters, sign-in destinations and sign-out.

The account menu uses the signed-in profile photo, with initials when the image
is missing or fails. Profile & photo opens `/profile`; account settings opens
`/settings`. The disclosure supports Tab, Enter, Escape, outside-click dismissal,
and focus restoration. Mobile controls have at least 44px tap targets.

To verify the account menu, start the fixture server with
`TIMEBANK_TEST_AVATAR_PATH=/absolute/path/to/profile.jpeg`, then run
`npm run test:timebank:account:selenium` from `web`. This covers loaded and broken
avatars, account navigation, sign-out, keyboard interaction, search clearing,
and 390px/320px layouts. Screenshots are in the `account` subdirectory of
`TIMEBANK_SHOTS`. The fixture never uploads the supplied JPEG to production.


### Timebank messages and notifications

Apply `0023_timebank_notifications.sql` before deploying this UI. **Message member**
opens the existing native portal DM and adds an editable draft with a link to the
listing. Opening a conversation does not send a message. New timebank members
receive a private contact record so the messenger can resolve them; existing
contact settings are preserved. Listing arrangement notes are optional.

The header shows unread messages. **Notifications** lists unread conversations
and the current community's activity: request uptake, pending hours, and confirmed,
declined or canceled exchanges. Opening a conversation uses the messenger's
existing read receipts. Activity has persistent per-user read state and cursor
pagination. Failures retain visible activity and show a retry control.

- `GET /api/timebank/notifications` returns 50 items, `unread_count`, and
  `next_cursor`; pass that cursor as `before` to load older activity.
- `POST /api/timebank/notifications/read` accepts `{ "ids": [...] }` (up to 100).
  IDs are constrained to the authenticated user and resolved community. Explicit
  IDs prevent newly arriving notifications being marked read unseen.
- `GET /api/timebank/listings/:id` resolves shared links, including closed listings,
  with the same authentication and community checks as the board.

SQL triggers commit each activity notification atomically with its action. Stable
IDs prevent retry duplicates. Withdrawing and taking up the same request again
does not send another uptake notification. Resolving hours retires its pending
notification. Hours still move only after confirmation.

The existing minute cron dispatches at most 100 unread, unqueued activity events
from the last 24 hours to `PUSH_QUEUE` when VAPID credentials are configured.
Queue submission failures leave the outbox record retryable; existing per-device
push delivery IDs deduplicate retries. Read or resolved alerts are suppressed at
consumption. The in-app inbox remains available without push credentials.

Device alerts reuse Web Push and ask permission only after an explicit click.
Turning them off removes only this browser's subscription. Native Capacitor
builds currently display **Device alerts are not connected in this mobile build**.
The platform adapter is `web/src/infrastructure/platform/notificationDelivery.ts`;
it deliberately does not attempt Web Push inside a native webview.

For the future Android/iPhone integration, connect that adapter to Capacitor push
registration, store authenticated per-installation APNs/FCM tokens, handle token
rotation and logout/revocation, and add native delivery alongside Web Push.
The queue payload already carries a stable notification ID, community ID, event
type, relative path, and absolute community URL. Handle notification taps by
restoring the community and session before opening the path, then refresh this
same inbox. Signed builds, APNs entitlements/credentials and Firebase configuration
remain required; native delivery is not enabled by this change. See the
[Capacitor push API](https://capacitorjs.com/docs/apis/push-notifications) and
[Apple registration documentation](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns).

Run `npm run test:timebank:messaging:selenium` from `web` against a fresh fixture.
It uses the production chat routes and SQLite migrations, with HTTP polling in
place of Durable Object sockets, to test two-member messaging, listing links,
unread states, uptake and exchange notifications, refresh failures and narrow
mobile layouts. Production acceptance separately checks the deployed services.


### LetsBMore archive import

`0025_timebank_import_claims.sql` stages an immutable source snapshot in the
`bmoretimebank` community. The source files and generated plan contain private
member information and must stay outside the repository and frontend assets.
Run the loader with Node 24 or newer:

```sh
node scripts/letsbmore-import.mjs --archive /private/archive --plan /private/import-plan.json
# Validate the migration and load against a local SQLite database first:
node scripts/letsbmore-import.mjs --archive /private/archive --plan /private/import-plan.json --local-db /private/org.sqlite --apply
# After backup, migration, and local acceptance, load the authorized production DB:
LETSBMORE_D1_ID=<org-database-id> node scripts/letsbmore-import.mjs --archive /private/archive --plan /private/import-plan.json --remote --apply
```

Remote loading requires `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` with D1
and R2 access. The loader verifies source counts, integer-minute conversion,
activity IDs, the exporting member's ledger reconciliation, and every image
checksum. Images are copied to `org-scan-images/timebank-imports/<batch-id>/`
and read back to verify their hashes. A batch stays unavailable until every
expected row is present and its content matches the plan. Rerunning the same
snapshot resumes staging or verifies the completed batch; a changed snapshot
is rejected. No existing timebank listing, exchange, or Dena account is rewritten.

The initial snapshot contains 75 profiles, 74 known balances totaling 414 hours,
108 activities, nine detailed historical exchanges, 100 account-to-record links,
and 126 images. The repaired advertised-activity list contains 55 offers,
41 requests, and one event. The two-column board shows the 96 offers/requests to
signed-in members, labelled as archived with source dates and original links.
Seventeen advertised records have no owner identified by the source; those are
retained as unassigned records, without guessing an identity. Events and ended
activities remain in the archive; owner-linked records appear after a claim.

An authenticated member searches **Claim LetsBMore account**, submits evidence,
and can withdraw a pending claim. A system administrator reviews it in
**Admin → Account claims** and records a reason. Administrators cannot approve
their own claims. Approval attaches the source balance once, rejects competing
claims atomically, and creates append-only audit entries. Historical transactions
are read-only evidence already included in the opening balance. New confirmed
exchanges adjust that balance; only those new exchanges enter rewarded-hours
and category/provider/beneficiary statistics. Unknown balances remain unknown.
Source messages, notifications, credentials, and account settings stay in the
private offline archive and are not injected into current conversations.

Authenticated import endpoints under `/api/timebank/imports` are `accounts`,
`me`, `listings`, `listings/:id/image`, `claims`, `claims/:id/withdraw`, `review`,
and `claims/:id` (PATCH for admin review). Account discovery exposes names and
former handles; balances/history require approved ownership or admin review.
Catalog and photo endpoints enforce community scope and return no-store/private
responses. Public offer feeds never include these imported records.

For Selenium, run the synthetic fixture with `TIMEBANK_TEST_IMPORTS=1` and
`TIMEBANK_TEST_PORT=8794`, then `node web/scripts/timebank-site-fixture.mjs` from
`portal`, and `npm --prefix web run test:timebank:imports:selenium`. The fixture
serves the actual site Worker and built `.cloudflare/site` assets so tenant root
navigation is tested. Use Selenium Chrome on port 4446. Browser acceptance tests
claim/withdraw/reclaim/review, private history, exact opening balances, logout,
community isolation, and 320px/390px layouts. Test identities and data are synthetic.
