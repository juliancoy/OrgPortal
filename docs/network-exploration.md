# Organization network exploration

The shared Canvas, WebGPU, 3D and N-dimensional network now opens in community
Overview. Visibility settings are above a collapsed Advanced section in Settings.
The existing URL codec, per-graph local preferences and IndexedDB evidence cache
remain the only persistence mechanisms. Share URLs omit default-valued controls; expansion IDs use the existing settings store and codec. Existing graph parameters remain valid.

## Exploration

Overview uses deterministic, bounded label propagation (up to 20 sweeps), cached
for each filtered dataset. Isolates retain their own identities. A community uses
its most connected member as a spatial anchor; its label includes organization
count. Expand a community using its label or the community list. Collapse it
using the same list button. Inter-community lines are representative records,
not summed payments; one original relationship per community pair is shown.
Community lists disclose internal and external relationship counts. Sector,
published county and published municipality groupings report unknown metadata
explicitly. Communities are a computational aid, not legal organizational units.

Selecting or searching for an organization switches to Focus, pins inspection,
and pans toward it without restarting the force worker. Choose one, two or three
hops. Other organizations retain spatial context with subdued rendering; unrelated
edges are omitted. Clear selection releases the pinned panel. All relationships
restores every eligible record and is explicitly labeled as cluttered. Repeated records with identical kind, direction, width, color and opacity share geometry, retaining every original ID; opposite directions and different relationship kinds remain separate. Inspection discloses bundles. Recorded amounts are not summed into invented aggregate transfers.

Labels support Hover, Priority and All. Priority favors selected/hovered nodes,
community anchors and well-connected organizations as zoom allows. All still
suppresses screen-space overlaps and offscreen labels. Selected labels remain
visible. Search results and label buttons provide keyboard selection; panel tabs
retain arrow-key navigation. Advanced projection and force controls remain in
place, including the working checkout's existing N-dimensional controls.

Node radii use square-root area scaling from 3 to 10 layout units. Community
markers use 5 to 14 units. Metrics are connections, recorded incoming USD,
recorded outgoing USD, or uniform. Missing amounts remain minimum-sized. Neutral
edges are the default; relationship-type colors are optional. Amount encoding
uses bounded logarithmic width. Opacity and documented-direction arrows are
configurable. Node color can show sector or computational grouping. Automatic,
light and dark themes use the same controls. Visibility reset does not rebuild
physics. Home fits the graph; Focus pans to selection. Spatial views support
orthographic and perspective cameras and 350 ms focus transitions; reduced-motion
preferences make transitions immediate. The 2D view has no perspective projection.

## Financial evidence and analytical layouts

`network-analysis.js` treats only explicit transfer, grant, donation and contract
kinds as directed financial relationships. Inferred associations, shared funding,
portfolio/co-investment and capitalization context never become transfers.
Voided records are excluded. USD metrics require a finite nonnegative numeric
amount and explicit USD currency. Duplicate award identities do not inflate metrics; uncertain and inferred statuses do not acquire monetary direction. Missing totals display Unavailable rather than zero. Direction does not prove payment, and reported
awards are never promoted to verified transfers. Currency conversion, inferred
amounts, inferred dates and fabricated confidence scores are not used.

Funding flow arranges documented sources, intermediaries and recipients into
three lanes, with arrows and optional amount widths. Type, organization category
and inclusive date filters use supplied metadata. Cycles may produce relationships
within an intermediary lane; no acyclic ordering is claimed. Missing dates do not
pass a bounded date filter. Missing amounts retain directional relationships
without an amount weight. Inspection lists original record IDs, kinds, statuses,
amount labels, dates, supplied confidence and source links, with incremental
record display for high-degree organizations.

Maryland geography projects published numeric latitude/longitude only, using a
local equirectangular layout. Out-of-state, missing and invalid coordinates are
counted and omitted rather than geocoded or assigned guessed centroids. County
and municipality markers aggregate only located members, using a derived centroid of their published coordinates. Expansion restores individual coordinates. Unknown group labels do not create guessed locations. Organization latitude/longitude and source references remain unchanged. This is a coordinate
layout, not a basemap or a district-boundary analysis. The bundled statewide
snapshot may have no usable coordinates; the empty-state count is intentional.
Legislative district grouping requires a separately verified dataset.

## Verification and performance

Run `npm run test:ecosystem`, `npm run build`, and
`node scripts/benchmark-network-analysis.mjs` from `web/`. Headless acceptance:

```sh
MAP_ORIGIN=http://127.0.0.1:5201 node scripts/check-network-overhaul.mjs
NETWORK_RENDERER=webgpu3d node scripts/check-network-overhaul.mjs
NETWORK_RENDERER=webgpu4d node scripts/check-network-overhaul.mjs
```

The N-dimensional fixture uses the existing, uncommitted N-dimensional controls
in the working checkout. The independently staged overhaul also builds against
the committed projection implementation. Browser checks use bundled public
snapshots and block live API calls; they do not establish production freshness.
Use headless Chrome with the repository's SwiftShader/Vulkan flags. Test pages
exercise disclosure, selection, three-hop focus, metrics, analytical views,
spatial camera modes, settings restoration and 390px mobile width.

Measured on this host, the synthetic 2,009-node/2,503-edge benchmark indexed and
clustered in about 26 ms, traversed every three-hop neighborhood in 3.4 ms, and
reused all cached neighborhoods in 0.7 ms; heap delta was about 2.6 MB. A broad
2-second CI budget protects against gross regressions without assuming workstation
speed. The bundled filtered graph contains 1,961 organizations, approximately
2,432 organization pairs, and 11,916 individual records. Overview displays 40
community markers and 60 representative inter-community relationships.

Final scenario comparisons with layout motion paused, headless software rendering:

| Renderer | All median / sample tail | Overview median / sample tail |
| --- | ---: | ---: |
| Canvas | 16.7 / 350 ms | 16.7 / 16.7 ms |
| 3D | 50 / 1,017 ms | 16.7 / 16.8 ms |
| Six-dimensional | 16.7 / 1,033 ms | 16.7 / 16.7 ms |

Input handlers peaked at approximately 15, 25 and 31 ms respectively. Samples
contain ten requestAnimationFrame intervals; the reported tail is the largest
sample, not a robust long-run percentile. They measure browser scheduling,
including outstanding layout/compilation work, rather than GPU draw time alone.
Observed heap during these scenarios ranged from roughly 99 to 133 MB and was
sensitive to garbage-collection timing.

An additional identical-viewport, reduced-motion comparison against the committed
pre-overhaul renderer used `benchmark-network-browser.mjs`. Both had approximately
16.7 ms median scheduling cadence. Baseline zoom-to-two-frames latency varied from
170 ms to 5,372 ms across runs, versus 39–40 ms for the new default Overview.
With explicit Chrome garbage collection, main-page heap was approximately 97.3 MB
for the baseline and 96.0 MB for Overview. This is diagnostic evidence, not a
production performance guarantee; builds and other checks shared the host.

A hardware GPU run and sustained live-physics/full N-D profiling remain
outstanding. In particular, full-record mode can still show substantial stalls
under software rendering. Default Overview targets the existing 10 FPS minimum
budget under load; the paused-layout samples do not establish live-physics FPS.
Reproduce with `node scripts/benchmark-network-browser.mjs` and `MAP_ORIGIN`
pointing to each separately served revision.

The renderer retains worker physics/rasterization, instanced spatial spheres,
batched edges, adaptive quality, label batching and cached public evidence.
Only one physical spring per organization pair is needed; every evidence record remains available to the renderer and inspection. Paused layouts consume queued snapshots and labels immediately instead of spreading stale state over thousands of frames. The existing scalar Barnes-Hut force traversal optimization is included in this milestone.
Community detection and adjacency construction run once per graph rebuild,
never per frame; the measured processing time does not currently justify a
second worker protocol. Visibility changes do not reset force state.

## Release boundary

Use only `scripts/release.mjs` and `docs/deployment/RELEASE.md`. The current
checkout includes independent, pre-existing changes. This task preserves those
unstaged changes, stages only its own integration, and does not make the checkout
clean by committing unrelated work. The documented clean-checkout release gate
requires an isolated clean release checkout. The current environment also has no `CLOUDFLARE_ACCOUNT_ID` or `CLOUDFLARE_API_TOKEN`; no production release or push was performed. The pre-existing N-dimensional UI changes remain unstaged, so their inclusion in a release needs separate reconciliation. No database changes are required.
