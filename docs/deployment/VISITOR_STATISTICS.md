# Visitor statistics

Cloudflare Web Analytics collects and aggregates browser page views and visits.
OrgPortal reads the aggregates for the system administrator's Statistics tab.
Memberships, registrations, tasks and audit activity remain application records;
audit actors and ledger accounts must not be labeled visitors or registered users.

## Collection

The account's existing Web Analytics sites auto-install the beacon for
orgportal.cc, lifetech.fyi, medtech.social, codecollective.us and deism.church.
Do not install a second browser collector or beacon. Cloudflare handles SPA
navigation through its beacon. Check the actual HTML and browser requests when
adding domains or changing proxies. Never inject production analytics into local
development or private previews.

## API configuration

`GET /api/org/api/admin/visitor-statistics?days=7` requires PIdP system admin
authority. `days` accepts 7 or 30; optional `host` must match an explicitly
configured production hostname. This is a system-wide administrator view, not
an organization manager reporting endpoint.

Configure these bindings on the `org-codecollective` API Worker:

- `CLOUDFLARE_ANALYTICS_ACCOUNT_ID`: Cloudflare account containing Web Analytics.
- `CLOUDFLARE_ANALYTICS_HOSTS`: comma-separated exact production hostnames.
  Defaults in the checked-in config cover OrgPortal, LifeTech, MedTech, the two
  Timebank sites and portal.deism.church. No wildcard preview domains.
- `CLOUDFLARE_ANALYTICS_API_TOKEN`: secret with **Account / Account Analytics /
  Read**, scoped to that account. Keep it server-side, never in Vite variables.

The code-only API release inherits live bindings, so configure the two nonsecret
bindings explicitly on the deployed Worker as well as retaining them in source.
Provision the read-only secret before releasing the panel. The connected
Cloudflare app can read analytics but cannot list token permission groups;
runtime credential provisioning has not been completed by this change.

Unconfigured and unavailable reports show a status message instead of zero
visitors. A provider outage does not prevent application statistics from loading.
No authenticated reporting data is publicly cached.

## Definitions and storage

- Report complete UTC calendar days, excluding the current partial day.
- `count` in `rumPageloadEventsAdaptiveGroups` is page views; `sum.visits` is
  visits. Neither is a count of distinct people or registered accounts.
- Daily totals group by date and hostname. Popular pages group by hostname and
  pathname, with a clearly labeled top-20 limit. Do not sum top pages as totals.
- Queries exclude known bots (`bot: 0`) and use the exact production host list.
  Browser blockers and Cloudflare sampling can affect measurements.
- No IPs, visitor identifiers, cookies, account identifiers, or raw clickstream
  are stored by this integration. OrgPortal stores no analytics copy or backups;
  Cloudflare manages collection and retention. Page and organization attribution
  uses the requested hostname/path, not an identity join.

References: [Web Analytics](https://developers.cloudflare.com/web-analytics/),
[metrics](https://developers.cloudflare.com/web-analytics/data-metrics/),
[API authentication](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/).
