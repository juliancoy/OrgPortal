# Default organization graph positions

`npm run build:network-positions` generates
`public/ecosystem-data/network-default-positions.json`. Run
`npm run build:network-positions -- --force` to regenerate unconditionally.
The normal frontend build runs the generator and skips integration when the
SHA-256 fingerprint of its inputs has not changed.

Positions are keyed by organization ID, with separate `2d`, `3d`, and `4d`
coordinates. Canvas and WebGPU use the same 2D physical layout. This is derived
visualization data, not a mutation of the authoritative organization registry.
The file includes source file references, the input fingerprint, force defaults,
sizing defaults, and integration diagnostics. Source artifacts retain their
original evidence references.

The generator uses the same bundled organization, relationship, and nonprofit
snapshots as initial graph loading, fund folding, financial sizing, deterministic
seeds, and force implementations. Refresh those evidence snapshots before
regenerating to incorporate new organizations. Live directory additions absent
from the generated file receive deterministic initial coordinates. Hidden
isolated organizations retain seed coordinates and do not affect visible nodes.
Current tab-session positions take precedence when rebuilding filters.

2D and 3D cool until alpha reaches the runtime stopping threshold (or the tick
budget is reached). 4D Particle Life uses a fixed 360-tick warm-up: its asymmetric
forces can remain in motion indefinitely, so this is a repeatable snapshot,
not a claim of mathematical equilibrium. Dither also permits ongoing motion.

Settings URLs use `graph-settings=2d` (or `3d` / `4d`) and JSON-valued `g.<control>` parameters,
or optionally `s=<base64url(gzip(JSON))>`, matching datacenters' native gzip
approach. Explicit URL state takes precedence over localStorage, preserves
unrelated parameters, and applies only to that graph type. Graph-type links restore the destination
graph's own preferences instead of carrying the current graph's settings.
Each graph type also stores its compression preference independently. Copy settings link records
all currently available controls. Searches, organization selection, and camera
position are outside settings state. Invalid values are ignored against control
constraints; compressed payloads have input and decoded-size limits.
