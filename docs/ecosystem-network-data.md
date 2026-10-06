# Ecosystem network data

The network includes the complete public organization directory, without a LifeTech tag filter. Production support records are read through the public OrgPortal API. `web/scripts/sync-portal-ecosystem.mjs` refreshes that evidence.

`web/scripts/build-network-history.mjs` reads every available `event_history.json`, `manual_events.json`, and `upcoming_events.json` at the CodeCollective root and its immediate source directories. Set `CODECOLLECTIVE_DIR` for a different checkout. Event occurrences are deduplicated by source URL and start date; cross-listed events with different source URLs remain distinct. All entries with a title and public URL are retained, including undated events. Organization links require source metadata or a Code Collective organizer URL; mentions alone do not establish hosting. The event browser searches the entire dataset and progressively displays results.

`web/public/ecosystem-data/ecosystem-research.json` contains sourced Maryland funding evidence and the user-reported Stand with Crypto contribution of $600 to Code Collective in 2026. The earlier $200 mention is excluded pending clarification. The ten Build Our Future awards retain individual amounts and the announcement date; the program total is not added as an extra transaction. State/agency affiliation is separate from funding. Awards do not establish cash settlement.

These files are public map evidence. They do not write the production `organization_support_records` table or `master_transaction_records` view. Production imports require authenticated API permissions and preview/apply receipts. The archive is a checkout snapshot, not a claim that every live platform event has been exhaustively fetched.

Validation: `npm run test:ecosystem`, `npm run test:events`, both Vite brand builds, and headless browser checks of event search and funding-source selection.

## Federal evidence added October 5, 2026

Federal departments, agencies and their Maryland recipients retain separate identities. The research file now includes NSF, SBA, DOE/ARPA-E, DoD/DARPA, NASA, Commerce/NIST, USDA/NIFA, FDA, CDC, Treasury and HHS; the existing NIH and EDA nodes are matched by name. Thirty-two sourced relationships cover institutional hierarchy, research collaboration, and awards. Examples include NSF's UMD-led quantum simulation institute, SBA FAST and Maryland STEP awards, Treasury's TEDCO BRIDGE award, NIST's historical Maryland MEP founding agreement, ARPA-E's UMD superinsulation project, NASA Dragonfly and DARPA prosthetics at Johns Hopkins APL, NIFA research projects, FDA CERSI centers, and annual CDC PHEP/PHIG funding.

The 2026 TEDCO FAST award amount remains undisclosed. FDA CERSI's $50M maximum is a program ceiling (`terms`), excluded from money-only links. Completed DARPA work and the 2013 NIST award remain explicitly historical. CDC PHIG's cumulative total is excluded because the individual yearly records already represent the funding. NSF's $25M institute award is not repeated as an award to every partner. Every added relationship carries its evidence URL and review date. Coverage remains a sourced selection, not a complete inventory of federal spending.

The shared page is `/ecosystem/network` (under `/p/` on CodeCollective). It uses the common portal navigation and live public tenant API. LifeTech owns its static directory and links into this shared page. The graph renderer aborts pending requests and releases graphics resources when the page unmounts.

## Connected organizations by default

“Hide organizations without connections” is checked initially and after Reset.
It removes nodes with no edges in the currently filtered graph, after category,
relationship, money-view and neighbor filters. Unchecking it reveals otherwise
eligible isolated organizations, including in the money view. Search, organization
details and evidence tables remain available for organizations hidden from the
map. No organization or relationship records are deleted.

Published October 6, 2026 in shared frontend version
`1704c534-3f22-4d66-886d-905b231a8121`. Fifteen ecosystem tests passed,
and the deployment's production route smoke checks passed. A headless browser
check uses saved public evidence to test the default, reveal isolated nodes,
hide all relationships and reset the map.
Both LifeTech and MedTech passed: 143 connected organizations appear by default,
unchecking the option reveals all 570 organizations, disabling all relationship
kinds leaves zero nodes, and Reset restores the checked option and 143 nodes.

## Hover inspector

Hovering a node or its label previews its organization details in the right
column; hovering an edge previews the relationship, amount, date, evidence,
notes and source. Hover does not change selection, the URL, filters or layout.
The last preview stays available when moving into the inspector to use its links.
Clicking a node still selects it. Keyboard focus on node labels and SVG edge
paths provides the same preview; touching an edge opens its evidence.

Pictures come from published OrgPortal organization media or published website
Open Graph/Twitter metadata, with an image-source link. Edge previews label
endpoint images as organization images rather than implying they show an award
or transaction. Missing pictures and failed image loads remain explicit.
`python3 web/scripts/sync-ecosystem-pictures.py` fills missing connected-node
pictures from current public website metadata without credentials or database
writes. Financial sizing and the default connected-node filter remain unchanged.

Published October 6, 2026 in shared frontend version
`548621bf-f76c-417f-ad8d-478683ff9b1a`. Sixteen ecosystem tests passed,
including image URL safety, source escaping and retention of attributed website
preview images during live refresh. Deployment route smoke checks passed.
Headless SVG checks on both domains verify physical node/edge hover, image/source
presentation, unchanged URL and node counts, persistent source links and keyboard
edge focus. WebGL uses raycasting for nodes and widened invisible edge hit areas;
SVG uses widened transparent stroke targets.

Repeat the read-only browser smoke test with
`BROWSER_BINARY=/usr/bin/google-chrome node web/scripts/check-ecosystem-hover.mjs`
(or omit `BROWSER_BINARY` to use Playwright's installed Chromium). The test forces
the SVG renderer and an unavailable live API to verify the saved public snapshot.
Both domains also passed an actual image-loading check. Screenshots are retained
in `docs/screenshots/ecosystem-hover-lifetech.png` and
`docs/screenshots/ecosystem-hover-medtech.png`.

## Viewport map workspace

The network fills the available viewport below the portal header. Vertical page
scrolling is disabled only while this route is mounted and restored on leaving.
The compact toolbar opens Filters, Details, Events, and Sources & help. The filter
and inspector panels scroll independently; events, evidence tables and methodology
remain available in internally scrolling dialogs. Small screens use closable panel
overlays so the map keeps the remaining viewport. The wheel handler covers the
entire canvas, including node labels, and zooms without moving the page.

A headless local check passed at 1440×900, 390×844 and 900×480: document height
stayed within the viewport, wheel over a label changed SVG zoom without scrolling,
controls scrolled internally, and event/source dialogs and mobile panels worked.
Repeat with `BROWSER_BINARY=/usr/bin/google-chrome node web/scripts/check-ecosystem-viewport.mjs`.
Set `MAP_ORIGINS` to comma-separated origins for a local preview.

Published October 6, 2026 in shared frontend version
`c3338606-56f3-4166-ba92-bfdbf13bf64a`. Both live domains passed the viewport
checks in SVG and WebGL modes, including desktop, mobile and short landscape
sizes, wheel zoom over labels, internal panel scrolling and dialog access. The
16 ecosystem tests and production route smoke checks passed. Set
`ECOSYSTEM_RENDERER=webgl` to repeat the browser check with WebGL enabled.
Screenshots: `docs/screenshots/ecosystem-viewport-desktop.png` and
`docs/screenshots/ecosystem-viewport-mobile.png`.
