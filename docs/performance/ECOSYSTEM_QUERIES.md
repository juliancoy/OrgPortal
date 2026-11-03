# Bounded ecosystem queries

The ecosystem pages use the public `/api/ecosystem/` API. The frontend Worker and
Vite development/preview servers share `web/server/ecosystem-query.mjs`.
They query a versioned, read-only index of published public research evidence.
This index is separate from private organization records and writable initiatives.

`web/scripts/build-ecosystem-query.mjs` builds from a checksum-verified public export
of the main transactional database: versioned public source collections plus native
support, financing, nonprofit grants and external financial observations. Private
ledger/account records are excluded. See [the unified database runbook](../unified-ecosystem-db.md).
Archival source JSON is only used for reviewed bootstrap and isolated tests.

The generator runs before the production bundle and at Vite startup. Rebuild the
frontend after changing source evidence; `generatedAt` is the index build time,
not the original evidence retrieval date. `transactionalCoverage` identifies the
source dataset, export time and native/Comptroller counts. This is a public cache
of database evidence, not a live query of every recent edit.

Small collections use organization/type membership and trigram postings. Large
relationship collections scan bounded 1,000-record search metadata chunks and
retain only requested page IDs; this preserves substring search without a giant
index file. Full evidence stays in 25-record chunks, with at most six read
concurrently. Topology uses integer endpoint references for large datasets.
Graph responses are limited to 250 nodes, 1,000 edges and 2 MiB, with explicit
truncation; the Relationships view retains every source record. Overview and
financial summaries are computed over the complete exported evidence at build
time. No browser request downloads and merges all source snapshots.

Endpoints:

- `overview`: full-snapshot counts and financial totals.
- `relationships`, `events`, `organizations`, `nonprofits`: filtered pages,
  `total`, `offset`, `nextOffset`; default 50 and maximum 100 records.
- `funding`: selected cohort/date statistics, filtered/sorted company pages,
  and an explicit CSV export of all matching companies.
- `performance`: filtered and sorted evidence pages, comparable cohorts,
  and full-snapshot coverage/exposure summaries.
- `graph`: at most 250 nodes and 1,000 individual transaction rows per page.
  The initial view requests `nodeLimit=25`; visible controls expand the top set
  to 50, 100 or 250 without replacing earlier ranks. The initial connected view
  starts at the organization with the most distinct counterparties, then grows
  through the most connected eligible counterparties, using transaction count
  to break ties. A disconnected component starts only after the current frontier
  is exhausted. This avoids a screen of mutually disconnected high-degree agencies.
  With `org` selected, the anchor stays first, followed by shortest hop distance,
  transaction count with the anchor, shared counterparties, global degree and
  row count; IDs break remaining ties deterministically. The response's `ranking`
  explains the basis and each organization's `relevance` reports its rank and
  contributing counts. These are connectivity measures, not claims of social
  importance or financial performance. Expansion preserves the selection and
  opens the next hop (up to three) if its current neighborhood is exhausted.
  Nodes connected in the full topology remain visible even when their source
  rows are on a later transaction page. Transaction pages cover distinct directed
  pairs before repeated rows from a pair, preserving all record IDs.
  Source rows retain their IDs, direction, amount and evidence. The renderer
  consolidates rows by ordered source/destination pair, preserving reverse
  directions as separate edges. Thickness is base width × row count^exponent
  (default 0.5; adjustable from 0.1 to 1). Counts cover the displayed transaction
  page; each edge's inspector lists its underlying rows without summing mixed
  financial measures. `edgeOffset` and `nextEdgeOffset`
  page transaction rows independently of organization pages, including when
  the 2 MiB response budget limits a page. Selecting
  a group or a searched organization loads a bounded scope, with 1–3-hop
  neighborhoods, published location groups, or dated funding filters.
  The default relationship graph does not substitute community summaries or
  discard the underlying rows. An explicit `summary=community` query remains
  available for aggregate research views.

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
