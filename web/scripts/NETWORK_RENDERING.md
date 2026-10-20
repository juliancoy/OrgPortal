# Network frame budget

The top-left canvas overlay shows rendered FPS and the current node-update cap.
It shows idle when no frames have completed recently. Canvas worker paints and
native WebGPU queue completions drive their counters; Three.js graphs count
render submissions after compilation.

The Minimum FPS setting ranges from 1 to 120 and defaults to 10. Each graph
type stores its own target in localStorage and readable/compressed settings URLs.
The controller targets the corresponding frame duration with headroom. It reduces
work rapidly after slow frames and restores it gradually below 70% of the target frame duration. A rotating
cursor ensures that all nodes receive updates even if newer worker snapshots
arrive before the previous snapshot is fully consumed. Only the latest physics
snapshot is retained. Physics remains in its worker; this budget controls the
main-thread position copies, 4D projection, label layout, and geometry updates.
Nodes remain visible while awaiting their next update.

Renderers cache unchanged geometry. GPU updates touch changed node instances and
incident links; Canvas receives coalesced position patches and caches unchanged
paths. At most one Canvas paint or native WebGPU frame is in flight. 3D/4D sphere
detail and pixel resolution decrease after sustained slow frames and recover
only after sustained fast frames. Topology/visibility/style changes still
require a complete geometry refresh. The 10 FPS target is adaptive, not a
hardware-independent guarantee.

Checks:

- `node --test scripts/frame-budget.test.mjs`
- `MAP_ORIGIN=http://127.0.0.1:5202 node scripts/check-network-fps.mjs`

The headless browser check uses isolated 180-node data, software Vulkan, all four
renderers, readout placement, and an FPS sample after initial adaptation. It is
not a performance certificate for every device or organization dataset.
