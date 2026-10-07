# Native WebGPU network

The separate `/ecosystem/network/webgpu` route uses the WebGPU API directly. The original `/ecosystem/network` route remains available; navigation links let users compare them.

`webgpu-renderer.js` owns GPU initialization, WGSL shaders, reusable vertex buffers, viewport uniforms, resizing, and disposal. Links are triangulated quadratic curves with quantity widths, dash patterns, and arrowheads, submitted in one draw. Nodes and funding pie sectors use instanced quads with fragment masks in a second draw. Camera-only changes update the viewport uniform without regenerating graph geometry. Funding slices retain the existing HSL palette and clockwise orientation from twelve o'clock.

`network-webgpu.js` owns the separate controller. It reuses the existing public evidence cache, fund hierarchy, financial sizing, visibility rules, previews, and D3 CPU physics. It imports neither Three.js nor the original network controller. This version is a two-dimensional graph: mouse or single-touch dragging pans; the wheel, buttons, and two-touch pinch zoom around the pointer. Search, keyboard-accessible labels, filters, pinned organization URLs, and reduced-motion behavior are retained.

WebGPU needs a secure context and an available browser adapter. Unsupported browsers show a clear status and a link to the original Graph page; this route never silently switches renderers. Device loss stops rendering and offers reload or the original page. Unmount destroys the device and buffers and removes listeners and observers.

## Verification

Start Vite on port 5193 (or set `MAP_ORIGIN` to a local server), then run from `web`:

```sh
npm run test:ecosystem:webgpu
```

The headless Chrome check enables WebGPU with Vulkan SwiftShader for reproducibility. It verifies GPU pixel output (pie colors/orientation, links, transparency), node picking, zoom, pan, sparse reveal, search, pinned-URL restoration, reduced motion, and missing-adapter behavior. It checks that the native route does not request Three.js. The screenshot defaults to `/tmp/network-webgpu-verified.png`; override with `GPU_SCREENSHOT`.

Software-adapter timing is not evidence of hardware performance. Compare both routes on the same hardware, viewport, evidence snapshot, zoom, and physics settings before drawing a performance conclusion. Physics and accessible DOM labels still execute on the CPU.
