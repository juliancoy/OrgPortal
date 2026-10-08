import { mountEcosystemNetworkGPU } from './network-webgpu.js'

// Share the interaction model with the native WebGPU view, using a lightweight
// canvas renderer on the default route so it works without a GPU adapter.
export function mountEcosystemNetwork(root, options) {
 return mountEcosystemNetworkGPU(root, {...options, renderer: 'canvas'})
}
