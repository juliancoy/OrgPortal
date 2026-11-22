# Maryland state organization, departments and budget funding

The graph reuses the existing `research-state-maryland` State of Maryland
organization and `state-of-maryland` portal slug. Its type is explicitly State
government organization. Organizational/listing relationships connect it to all
80 agency-code entries in the FY2027 funding-source dataset. The state inspector
lists every entry independently of the graph's relevance and node-count limit,
with links to each entry's graph.

The listing distinguishes 24 department entries (the 22 principal departments,
the education department and Military Department), 51 other agencies, offices or
branches, and five budget headings. Budget headings are not represented as legal
organizations or government departments. Independent offices and other branches
are not asserted to report to the Governor.

## Funding semantics and scope

Maryland DBM's funding-source dataset `gy87-e27x` supplies one appropriation edge
per original program/fund-source row. These edges originate at the State of
Maryland organization. Fund type, program and fund-source code are attributes of
the row, not separate organizations. Federal-origin funds retain their federal
classification; administration through the state budget does not imply that
state taxes supplied them.

The 2,360 FY2027 legislative-appropriation rows total $65,184,504,124 within this
dataset's scope. They do not represent a complete state cash-flow statement.
The 117 DHCD rows reconcile to $902,223,261: General Funds $98,876,636; Special
Funds $283,577,978; Federal Funds $512,852,020; American Rescue Plan Act of 21
$6,916,627. The two federal categories sum to the State Archives summary's
$519,768,647. Reimbursable funds and separate capital-budget allocations are not
added to these imported operating-budget funding-source rows.

A separate nonmonetary `agency` / `affiliation` relationship connects each listed
entry to Maryland; it adds no appropriation or cash payment. Appropriations
participate in graph direction, relevance and funding-view filters, but do not
enter payment totals, payment pies, monetary sizing or account balances. Budget
summaries group each fiscal year, status and direction separately. They never
add different years or proposed/working/enacted versions together. Renderers
consolidate displayed rows by ordered node pair and retain individual evidence.

## Sources and identity

Reviewed November 3, 2026:

- https://opendata.maryland.gov/Budget/Maryland-Operating-Budget-Funding-Source/gy87-e27x
- https://operatingbudget.maryland.gov/ (explicit FY2027 legislative appropriation status)
- https://www.msa.maryland.gov/msa/mdmanual/17dhcd/html/dhcdb.html (DHCD reconciliation)
- https://www.maryland.gov/your-government/state-agencies-and-departments
- https://msa.maryland.gov/msa/mdmanual/01glance/pdf/00overview.pdf
- https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gsg&enactments=false&section=8-201

The Socrata description still mentions older years. Status is explicitly reviewed
against DBM's portal, never inferred from stale metadata or a fiscal year alone.
The statewide preparer supports this reviewed year/status only and fails if
source counts, the reviewed 80-code listing or DHCD reconciliation changes.

`web/scripts/maryland-government-agencies.json` is the explicit reviewed identity
crosswalk. Existing agency source IDs and the established TEDCO organization are
reused where matched; other entries use stable DBM agency-code identities. This
does not fuzzy-merge historical labels, city/county departments or federal award
recipient identifiers. It creates no account ownership or privileged directory
identity. The established DHCD counterparty ID and 117 appropriation source IDs
remain stable. Each appropriation retains its original source row, fiscal
period, direct source query, program and fund codes, and budget-status evidence.

## Preparation, publication and lifecycle

Run `web/scripts/prepare-maryland-government.mjs --out /private/dataset.json
--fiscal-year 2027 --budget-status legislative_appropriation`. It verifies every
collection and checksum of the current version-pinned public database snapshot,
preserves unrelated evidence, metadata and positions, and prepares the reviewed
statewide projection. It writes a complete dataset, source archive and checksums
without changing production. Unreferenced fund-category nodes from the initial
DHCD-only projection are removed in the replacement snapshot.

Review counts and SHA256, then publish using the existing
`org-worker/scripts/import-unified-ecosystem.mjs` operator preview/apply workflow
with the reviewed SHA256 and deployed API commit. The previous dataset stays
active until complete digest reconciliation and atomic publication. No schema
migration, account balance change or ledger settlement is involved. A frontend
build refreshes the public graph index from the authoritative database.

The earlier `prepare-maryland-budget.mjs` is the historical DHCD-only preparer;
use the statewide preparer for this model. Public government records inherit the
annual manual review, correction, archived-version deletion and downstream cache
handling in `unified-ecosystem-db.md`. No new personal-data store is introduced.

## Organization profiles and source agency references

The local organization About view now uses the shared, public
`/api/ecosystem/organization-evidence?org=<id-or-unique-portal-slug>` read model.
The generic projection follows documented organizational listings independently
of funding recipients, keeps budget headings distinct, and exposes every listed
child without the graph's node limit. Source-only agencies can be inspected in
place without creating directory organizations, memberships or ownership.

Evidence is scoped to the selected organization, paginated and filterable by
record kind. State appropriations, agency disbursements and approval observations
remain separate. The view shows its generated snapshot date; it updates when the
standard database-backed ecosystem index is rebuilt. It is not a writable local
source of organization data. Production publication remains a separate release.

`source-agency-references.mjs` resolves explicit source-system, dataset and agency
code references. The Maryland adapter supplies reviewed DBM codes for MD-VIEW and
explicit BPW-to-DBM agency references. Native identity assignments take precedence.
Original source labels, codes, observation IDs, signed amounts and financial
semantics remain intact. Sub-agencies, ambiguous abbreviations, universities and
unreviewed source codes are not silently collapsed into a department; their
source-label records remain available in the ecosystem evidence. Names never
establish identity or hierarchy.

Validate the focused projection and API with:

```sh
node --test web/scripts/organization-evidence.test.mjs web/scripts/unified-ecosystem.test.mjs web/scripts/maryland-state-government.test.mjs
```

`web/scripts/validate-organization-evidence.mjs` checks the generated index and can
accept the original Comptroller observations JSONL to reconcile every source row.
`web/scripts/test-local-organization-evidence.py` performs a read-only local Docker
browser clickthrough, with external requests and writes blocked, and captures
both themes at desktop/mobile widths. Record every invocation and its code/input
fingerprint in the adjacent test log. Captures and source payloads remain in
ignored local artifacts, not the public repository.

## Embedded organization EcoMap

Every public organization page displays its direct EcoMap neighborhood at the top,
above the organization details. Directory and source-evidence routes share one
persistent map layout. The generic
`/api/ecosystem/organization-map?org=<id-or-unique-portal-slug>` endpoint resolves
the same exact identity aliases as the evidence view and pages all adjacent nodes
from the versioned topology. Incoming and outgoing relationships are both included;
reciprocal relationships retain their separate directions. Repeated records are
bundled by directed pair, with record counts and kinds preserved, without adding
financial amounts. The map does not include second-hop connections.

The browser follows every page against one pinned snapshot, checks completeness,
and renders the center organization and all neighbors with the shared EcoMap
canvas renderer. Labels are reduced to avoid collisions; search, pan, zoom and
fit controls expose the complete neighborhood. Clicking a node, label or search
result opens its organization page immediately. Nodes with a directory slug use
`/orgs/:handle`; nodes without one use `/ecosystem/organizations/:nodeId`, a public
source-evidence page keyed by the exact graph identity. No directory record or
membership is created. Each destination shows only its own one-degree neighborhood.
Map mode, camera angle and zoom, orbit/free-fly setting and speed travel with the
navigation; the camera target recenters on the new node. Browser history retains
visited map settings. Clicking the center node leaves the current page in place. An organization
without documented relationships displays its own node and an explicit empty state.

Focused checks: `node --test web/scripts/organization-map.test.mjs`,
`npm --prefix web test -- src/features/ecosystem/organizationMap.test.ts --maxWorkers=2`,
and `web/scripts/test-local-organization-ecomap.py`. The read-only local browser
check covers actual node selection, pan/zoom/fit, organization navigation and
desktop/mobile captures in both themes. Record runs using the adjacent test log.

The embedded map has selectable 2D and 3D modes. 3D reuses the full EcoMap's
`createNetworkGPU3D` renderer with its WebGL2 backend, orbit and free-fly
navigation. The immersive map retains its existing automatic backend selection. The embedded and full 2D maps share `planar-navigation.js` for
frame-timed WASD/EQ movement, Shift/Control speed modifiers and key cleanup.
Only the focused canvas receives navigation keys; clicking the canvas, using a
map action or tabbing into it activates navigation. Blur, window blur, hidden
documents and disposal clear held keys; Escape releases canvas focus. Search and
other form fields retain normal typing. Switching renderers creates a fresh
canvas and disposes stale asynchronous initializations. Full-map links retain
the selected rendering mode and organization.

`web/scripts/test-local-organization-map-navigation.py` exercises actual 3D
rendering and movement, all six navigation keys in each mode, key release/focus
loss, typing, pointer controls, mode switching and organization navigation. It
also captures desktop/mobile 3D layouts in both themes. The shared keyboard
helper has focused coverage in `planarNavigation.test.ts`.

Node navigation retains the same canvas, graphics context and controls. The old
neighborhood remains interactive while a complete, version-pinned replacement
loads; failed requests leave it visible with a retry action. Common nodes move
from their existing positions into the new layout over 420 ms while the camera
recenters, retaining zoom and orientation. Reduced-motion preferences skip the
transition. Newer navigations cancel stale requests. A 60-second cache of complete
neighborhoods is bounded to 12 entries and 20,000 nodes; retries bypass that cache.
`web/scripts/test-local-organization-map-continuity.py` verifies canvas and context
identity, delayed/failed requests, rapid navigation, history and keyboard focus.
