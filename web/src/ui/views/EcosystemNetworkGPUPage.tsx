import { useEffect, useRef } from 'react'
import { portalPath } from '../../config/portalBase'
import markup from '../../features/ecosystem/markup.html?raw'
import '../../features/ecosystem/network.css'
import { useNetworkViewport } from '../../features/ecosystem/useNetworkViewport'

export function EcosystemNetworkGPUPage({ spatial = false }: { spatial?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  useNetworkViewport(root)
  useEffect(() => {
    const legacyView = window.location.hash === '#network-events' ? 'events' : window.location.hash === '#network-table' ? 'relationships' : null
    if (legacyView) { window.location.replace(portalPath(`/ecosystem/network/${legacyView}`) + window.location.search); return }
    document.title = spatial ? 'Organization network · 3D WebGPU' : 'Organization ecosystem network · WebGPU'
    if (!root.current) return
    root.current.innerHTML = markup.replace('href="/ecosystem/network" aria-current="page"', 'href="/ecosystem/network"').replace(`href="/ecosystem/network/${spatial ? '3d' : 'webgpu'}"`, `href="/ecosystem/network/${spatial ? '3d' : 'webgpu'}" aria-current="page"`).replace('Organization network</h1>', `Organization network · ${spatial ? '3D WebGPU' : 'WebGPU'}</h1>`)
    if (spatial) {
      const note = document.createElement('p')
      note.className = 'eco-note'
      note.textContent = 'Drag to orbit · right-drag to pan · scroll or pinch to zoom. Click a sphere to pin its details. Spheres use organization colors; funding breakdowns appear in Details.'
      root.current.querySelector('.eco-network-controls')?.prepend(note)
    }
    const host = root.current
    let disposed = false
    let cleanup: (() => void) | undefined
    void import('../../features/ecosystem/network-webgpu.js').then(({ mountEcosystemNetworkGPU }) => {
      if (disposed) return
      cleanup = mountEcosystemNetworkGPU(host, {
        dataUrl: portalPath('/ecosystem-data/ecosystem-portal.json'),
        historyUrl: portalPath('/ecosystem-data/ecosystem-relationships.json'),
        apiPrefix: '/api/org/api/network', portalPath, renderer: spatial ? 'webgpu3d' : 'webgpu',
      })
    }).catch(() => { if (!disposed) host.textContent = 'The network could not load. Reload to try again.' })
    return () => { disposed = true; cleanup?.() }
  }, [spatial])
  return <div ref={root} className="portal-ecosystem eco-page" />
}
