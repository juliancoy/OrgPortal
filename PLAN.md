# Network visualization overhaul

Completion evidence: [PLAN_HISTORY.md](PLAN_HISTORY.md).

## Phase 1 — Indexed analysis and financial semantics
- [ ] Build cached adjacency, bounded hop traversal, deterministic community membership, aggregate counts, and conservative financial metrics. Verify disconnected nodes, missing values, inferred links, and 1–3 hops with Node tests.

## Phase 2 — Progressive exploration (depends on phase 1)
- [ ] Integrate Overview / Focus / All disclosure, community expansion and grouping, bounded size metrics, label modes, neutral edges and opacity into shared renderer without restarting physics for visibility changes. Verify unit tests, build and headless browser interactions.
- [ ] Add reliable funding-flow filters and verified geographic layout, missing-data reporting, inspection provenance and legends. Verify fixtures and browser interactions.

## Phase 3 — Navigation, accessibility and persistence
- [ ] Add camera projection and bounded transitions, responsive Visibility controls, theme selection and reset; reuse existing compact settings URLs and local storage. Verify keyboard, mobile, reduced motion and URL restoration.

## Phase 4 — Acceptance and release
- [ ] Measure before/after frame time, FPS, heap and interaction latency at statewide scale. Record hardware-independent analysis benchmarks and browser limitations.
- [ ] Run ecosystem checks and production build, document behavior and remaining data limitations; commit coherent milestones on current branch.
- [ ] Release through OrgPortal release flow only when checkout/release prerequisites pass; verify public frontend/API commit identity.

## Known release constraint
The checkout has pre-existing tracked and untracked changes across renderer, physics, navigation, login and home files. Preserve those edits. The documented release command requires a clean checkout; do not commit unrelated work to bypass that requirement.
