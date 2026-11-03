# Progressive graph loading

The shared Ecosystem Explorer loader applies each bounded graph response over
successive animation frames. It starts with 24 organizations and adjusts batches
between 4 and 48 using ingestion cost and the configured minimum FPS target.
Relationships enter only after both endpoints are present. Page and snapshot
totals remain separate from the number currently loaded.

Topology updates reuse the layout worker, node objects, positions, velocities and
fixed axes. The 2D/3D solvers replace their forces on the existing simulation;
N-dimensional layouts reindex their relationships on the existing engine. Worker
messages carry a topology generation so queued positions from an earlier node
order cannot corrupt the current graph. Projection and camera state survive
incremental updates. A scope change aborts pending fetches and batches; requests
continue to use the existing snapshot version constraint.

This changes client ingestion, not the transactional database or API indexes.
The client still waits for the bounded JSON response before starting a scope's
batches. Server-side streaming, persistent overview caching, neighbor-based
seeding and entry fades are not implemented by this change. Existing page limits
and explicit filters remain in effect; loading a page does not load the entire
database into the renderer.

## Verification

Run from the repository root:

```sh
node --test web/scripts/progressive-graph.test.mjs web/scripts/ecosystem-physics.test.mjs web/scripts/graph-3d.test.mjs web/scripts/particle-life-4d.test.mjs web/scripts/frame-budget.test.mjs web/scripts/network-layouts.test.mjs
node web/scripts/check-progressive-graph.mjs
```

The browser check starts an isolated host Vite server with synthetic public
responses and checks 2D, 3D and 4D ingestion, intermediate batches, one layout
worker per view, and browser errors. It requires local Playwright Chromium and
port 5198. It performs no production writes or authenticated requests.

## Parents and children

Selecting an organization starts with children (outgoing relationships). Clicking
the selected node toggles to parents (incoming relationships), and clicking it
again returns to children. Other nodes remain clickable; selecting one preserves
the direction. The scope status names the direction and shared URLs retain it.
A node with no parents or children stays visible so the direction can be toggled
again. Parent/child here follows stored source/target direction, including
non-fiscal relationships; it does not infer ownership or a unique primary parent.

The graph API accepts `direction=parents|children|both`; omitted direction retains
legacy bidirectional behavior. Direction is applied before node pagination, and
traversal uses the existing per-organization edge index.

`node web/scripts/check-node-parent.mjs` checks pointer and keyboard toggles,
clickable parents, empty scopes and reloads in 2D, 3D and 4D. Run this browser
check in isolated local Docker. It defaults to the supported WebGL2 fallback for
3D/4D on software graphics hosts; `GRAPH_PARENT_NATIVE_GPU=1` enables native
WebGPU testing on a suitable host.
