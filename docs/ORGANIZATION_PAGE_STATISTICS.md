# Organization page statistics

Each successful public `/orgs/:slug` page entry sends one anonymous, best-effort
count to POST `/api/network/orgs/public/:slug/page-view`. React Strict Mode,
auth/session changes and Info/Board/Personnel/Branding tab changes do not add
another view. Reloading or returning to the page does. Dashboard visits, failed
organization loads, API data requests, and known crawlers/link previews are not
counted. Blocking JavaScript or the request can reduce counts. These are page
views rather than unique visitors and are not a fraud-resistant billing metric.
The counter has no effect on page rendering when unavailable.

Owners and organizers can open **Page statistics · Managers only** in Info on
the public page or dashboard. It shows totals since tracking began, Today,
Last 7 days, Last 30 days, and a daily table for 7/30/90/365 days. UTC windows
include today. Empty dates are zero-filled; unavailable reports show an error
rather than a fabricated zero. Tracking starts on deployment; historical traffic
is not backfilled. Existing global Cloudflare Analytics reports remain separate.

GET `/api/network/orgs/:organizationId/page-statistics?days=30` and MCP
`get_organization_page_statistics({organizationId, days})` require current
organization management access. MCP additionally requires `org:portal.read` and
honors organization-limited connections. Responses are `no-store`. The browser
report is memory-only, outside shared public IndexedDB data.

No visitor identity, IP, referrer, user agent or per-view record is stored. The
browser count request omits credentials and sends `{}`. Same-origin browser
fetch metadata is accepted across tenant proxies; clients without it need the
matching public Origin header. Cross-site/same-site requests and oversized
payloads are rejected. User agent / Cloudflare verified-bot signals are checked
without retaining them. Local read replicas cannot write production counts and
do not expose locally fabricated reports. Isolated local primary test fixtures
keep their own counts.

Migration 0106 adds two tables keyed by canonical organization ID, so slug
changes do not reset counts. Daily and lifetime increments commit atomically.
Daily buckets retain 365 days and are removed in batches of 500 by the existing
cron cleanup. Totals last for the organization's lifecycle; organization deletion
cascades both tables. Neither enters the immutable journal or public replication.
See the privacy retention policy and restore runbook. Review/apply the migration
before releasing; previous Workers ignore the additive tables, and Worker
rollback does not erase counters.

Validation: `organization-page-statistics.test.ts`, `retention.test.ts`,
`change-journal.test.ts`, type checks, and the isolated Docker clickthrough
`web/scripts/test-local-organization-page-statistics.py`.
