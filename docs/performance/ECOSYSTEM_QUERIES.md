# Bounded ecosystem queries

The ecosystem pages use the public `/api/ecosystem/` API. The frontend Worker and
Vite development/preview servers share `web/server/ecosystem-query.mjs`.
They query a versioned, read-only index of published public research evidence.
This index is separate from private organization records and writable initiatives.

`web/scripts/build-ecosystem-query.mjs` builds the index from the published portal,
relationship, event, nonprofit, performance, and position snapshots. Existing
identity reconciliation, award deduplication, currency rules, signed obligations,
and funding-stage calculations remain the source of summary calculations.
The generator runs before the production bundle and at Vite startup. After source
evidence is updated, rebuild the index and frontend; `generatedAt` is the index
build time, not the original evidence retrieval date. Source coverage/retrieval
metadata stays in responses. These endpoints do not claim to be live queries of
all recently edited organization records.

Organization/type membership and trigram postings identify matching record IDs.
Only the three least common search trigrams are read, followed by exact substring
verification against compact metadata. One/two-character searches inspect compact
metadata. Full evidence records live in 25-record chunks; at most six chunks are
read concurrently. Overview and financial summaries are computed at build time.
No request downloads and merges the complete original evidence snapshots.

Endpoints:

- `overview`: full-snapshot counts and financial totals.
- `relationships`, `events`, `organizations`, `nonprofits`: filtered pages,
  `total`, `offset`, `nextOffset`; default 50 and maximum 100 records.
- `funding`: selected cohort/date statistics, filtered/sorted company pages,
  and an explicit CSV export of all matching companies.
- `performance`: filtered and sorted evidence pages, comparable cohorts,
  and full-snapshot coverage/exposure summaries.
- `graph`: at most 250 nodes and 1,000 distinct connection representatives.
  The overview uses explicitly labeled community aggregate markers. Selecting
  a group or a searched organization loads a bounded scope, with 1–3-hop
  neighborhoods, published location groups, or dated funding filters.
  Each representative references actual source evidence; its `recordCount`
  describes additional records available in the relationship table. It is not
  an additional transaction or additive financial aggregate.

Geographic queries use `mode=geography` and optional `bbox=west,south,east,north`.
Wide views return county aggregate markers; narrower bounds return published
Maryland coordinates only. Missing/out-of-state coordinates remain explicitly
counted. County centers are centroids of published member coordinates, not
inferred organization locations. The 2D view queries after pan/zoom; spatial
views can select published county/municipality groups.

Graph financial summaries, top counterparties, pies, and size normalization use
the entire snapshot, independent of the loaded page. Pies retain the 15 largest
slices and combine the rest into an explicitly labeled remainder with the exact
remaining amount. Evidence copies are not embedded in each chart slice. Full
supporting records remain available through the relationship table.

Requests pin `version` after their first response. A changed snapshot returns 409
and requires reloading the view rather than mixing pages. UI requests debounce
search, abort obsolete requests, and reject stale responses. Public successful
responses allow 60 seconds of caching; errors are not cached. Query parameters
are never interpreted as storage paths. Unknown routes, malformed dates, invalid
bounds, oversized searches, and invalid page sizes receive explicit errors.

The writable intervention feed remains in the organization API. It returns 50
filtered plans per page and SQL-calculated global totals. Its existing management,
preview/apply, and audit controls remain in force. The dashboard does not exhaust
the feed or download the full directory.

Validation:

```
npm --prefix web run test:ecosystem
npm --prefix web test -- src/features/ecosystem/ecosystem-query.test.ts --maxWorkers=2
npm --prefix web run build
cd org-worker && node --import tsx --test test/interventions.test.ts
```

`NETWORK_TEST_ORIGIN=https://localhost:8443 node web/scripts/check-ecosystem-query.mjs`
checks actual view components against the local HTTPS API at desktop and phone
sizes through an isolated read-only fixture (no sign-in or session modification).
It verifies paging, search, bounded graph loading, dimensional views, and that
pages do not request complete evidence files. API/browser receipts are written
to ignored `artifacts/ecosystem-query/`. Distributed tests also run the source
parity/API checks through the frontend test catalog.
