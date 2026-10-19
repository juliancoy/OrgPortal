# Network overhaul completion history

- `fdc41b1` — Indexed graph analysis: cached 1–3 hop BFS, deterministic bounded label-propagation communities and grouping counts, conservative directed USD metrics, and bounded area sizing. Node analysis tests passed.

## Visualization implementation milestone

Commit: `96d5689` — `Overhaul organization network exploration and financial inspection`.

Completed phases:
- Progressive Overview / Focus / All disclosure; computational, sector, county and municipality groups; expansion and stable IDs; full-record retention with shared geometry for identical visual semantics.
- Conservative financial direction and amount handling, original-record inspection and source links, missing-total labels, bounded node metrics, neutral edges, optional arrows, opacity, type/amount encoding, and legends.
- Adaptive Hover / Priority / All labels using screen-space collision management; retained search and pinned selection; responsive inspection, clearing and camera focus.
- Funding lanes with type/category/date filters; published-coordinate Maryland layout, county/municipality centroids and expansion, and missing/out-of-state location reporting.
- Visibility controls, separate Advanced section, light/dark/automatic themes, perspective/orthographic spatial cameras, reduced-motion-aware focus, default-eliding share URLs, persistent expansion, and reuse of existing local preferences and evidence caches.
- Indexed metrics and clusters outside the frame loop, one physical spring per pair, immediate paused-state updates, shared edge geometry, and the existing scalar Barnes-Hut optimization. Regenerated the committed position cache and verified its fingerprint against every staged source input.

Verification:
- Current checkout: all 18 ecosystem test files passed; production build passed, including regenerated position caches.
- Isolated staged snapshot: ecosystem tests and production builds passed independently of unrelated working-tree changes.
- Required frontend release checks: 229 application tests and 44 routing/release tests passed.
- Headless Canvas, native WebGPU, 3D and six-dimensional fixtures passed with no page errors. Checks cover controls, selection and deep-link reload, three hops, inspection, analytical layouts, spatial camera modes, theme/URL restoration, persistent expansion, keyboard tabs, and 390px mobile width. Six-dimensional checks use the retained pre-existing N-D working-tree implementation.
- New pure tests cover disconnected and unknown organizations, hop bounds/cache reuse, community membership/expansion, missing and uncertain money, duplicate award identities, type preservation, geometry bundles, physical-link deduplication, funding filters/roles, geographic centroids/expansion, and missing/out-of-state coordinates.
- Synthetic 2,009-node / 2,503-edge processing: approximately 26 ms indexing/clustering, 3.4 ms for all three-hop queries and 0.7 ms cached; broad CI budgets passed.
- Bundled graph: 1,961 displayed organizations and 11,916 records; Overview reduces geometry to 40 community markers and 60 representative inter-community relationships. Paused-motion samples, baseline comparisons, heap figures and limitations are recorded in the implementation documentation.

Production release and sustained hardware-GPU acceptance remain in PLAN.md.
