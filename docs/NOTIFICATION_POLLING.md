# Notification polling and database costs

The header refreshes notification counts and the personal task queue once per
minute while the page is visible and online. Focus, visibility restoration, and
reconnection resume refreshes, with a ten-second minimum between automatic starts.
Automatic refreshes never overlap. Hiding the page, disconnecting, unmounting, or
changing accounts cancels the relevant automatic requests. New manual requests
cancel superseded requests, and responses from previous credentials are discarded.
Notification lists load when the menu opens, on manual refresh, and on each poll
while the menu remains open. Closing the menu makes no new requests. Mutations
continue to refresh the affected UI immediately.

For an open, visible, signed-in tab with the menu closed and no extra interaction:

| Scheduled requests | Before, per hour | After, per hour |
| --- | ---: | ---: |
| Notification summary and lists | 360 | 60 |
| Task queue | 120 | 60 |
| Combined | 480 | 120 |

This is a request-count reduction, not a measured dollar saving. Other app polling
is outside this change. Each tab still has its own polling lifecycle.

## Measure database work

GET requests to `/api/network/notifications/summary`, `/api/network/notifications`,
`/api/network/connections/requests`, and `/api/tasks` include a `Server-Timing`
entry named `d1`. Its description contains executed query count, rows read, rows
written, and operations whose row metadata was unavailable. Duration is cumulative
time awaiting database calls, including network time, rather than Worker CPU time.
It covers the request's `DB` prepared queries and batches, including authentication
and tenant lookups that use that binding. Other bindings, upstream identity work,
and uninstrumented D1 operations such as `raw`, `exec`, or session APIs are excluded.
The current instrumented routes use prepared queries and batches.

The middleware copies the request environment and wraps its DB binding; it never
changes the shared binding or runs a query again to measure it. `first()` uses one
`all()` execution of the same SQL to obtain D1's row metadata, then returns the
first result. One percent of these requests also emit a `database.cost` structured
log with only the static route, response status, and aggregate measurements.
No SQL, bound values, tokens, account IDs, query strings, or result rows are logged.
There is no new metrics table or background database write. Sampled logs use the
existing Workers log retention and permissions.

Use browser network timings to compare actions, and aggregate sampled logs by
route to identify high reads or writes. These samples are diagnostic estimates,
not billing records. Inspect expensive query plans before adding indexes or caches.

## Validation

- `npm --prefix web test -- src/infrastructure/http/activePolling.test.ts --maxWorkers=2`
- In `org-worker`: `node --import tsx --test test/database-cost.test.ts`
- `node web/node_modules/typescript/bin/tsc -b web/tsconfig.json`
- `npm --prefix org-worker run typecheck`
- `python web/scripts/test-local-notification-polling.py` against the isolated
  common-form Docker stack (default localhost port 19458). The script uses a
  synthetic local account and local-only requests; it checks replication is off
  and log-only email delivery before setting up fixtures. It verifies real menu
  behavior, polling counts, hidden/offline suspension, resume, diagnostics, and
  sign-out cleanup using a controlled browser clock.
