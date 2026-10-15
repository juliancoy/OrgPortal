import { useEffect, useRef } from 'react'
import { portalPath } from '../../config/portalBase'
import markup from '../../features/ecosystem/markup.html?raw'
import '../../features/ecosystem/network.css'
import { useNetworkViewport } from '../../features/ecosystem/useNetworkViewport'

export function EcosystemNetworkGPUPage({ spatial = false, four = false }: { spatial?: boolean; four?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  useNetworkViewport(root)
  useEffect(() => {
    const legacyView = window.location.hash === '#network-events' ? 'events' : window.location.hash === '#network-table' ? 'relationships' : null
    if (legacyView) { window.location.replace(portalPath(`/ecosystem/network/${legacyView}`) + window.location.search); return }
    document.title = four ? 'Organization network · 4D Particle Life' : spatial ? 'Organization network · 3D WebGPU' : 'Organization ecosystem network · WebGPU'
    if (!root.current) return
    root.current.innerHTML = markup.replace('href="/ecosystem/network" aria-current="page"', 'href="/ecosystem/network"').replace(`href="/ecosystem/network/${four ? '4d' : spatial ? '3d' : 'webgpu'}"`, `href="/ecosystem/network/${four ? '4d' : spatial ? '3d' : 'webgpu'}" aria-current="page"`).replace('Organization network</h1>', `Organization network · ${four ? '4D Particle Life' : spatial ? '3D WebGPU' : 'WebGPU'}</h1>`)
    if (spatial || four) {
      const note = document.createElement('p')
      note.className = 'eco-note'
      note.textContent = 'Drag to orbit · right-drag to pan · scroll or pinch to zoom. Click a sphere to pin its details. Spheres use organization colors; funding breakdowns appear in Details.'
      root.current.querySelector('.eco-network-controls')?.prepend(note)
    }
    if (four) {
      const controls = root.current.querySelector('.eco-network-controls')!
      controls.insertAdjacentHTML('afterbegin', `<fieldset><legend>4D Particle Life</legend>
        <p class="eco-note">Four spatial coordinates (X, Y, Z, W), projected into 3D. Category attraction rules are synthetic, not evidence of relationships. Funding links still show documented records. Inspired by <a href="https://github.com/tom-mohr/particle-life" target="_blank" rel="noreferrer">Particle Life</a>.</p>
        ${['xw','yw','zw'].map(axis => `<label>${axis.toUpperCase()} rotation <output id="life-${axis}-value">0</output>°<input id="life-${axis}" type="range" min="-180" max="180" step="1" value="0"></label>`).join('')}
        <label>4D perspective <output id="life-perspective-value">0.35</output><input id="life-perspective" type="range" min="0" max="0.8" step="0.01" value="0.35"></label>
        <label>Interaction radius <input id="life-radius" type="number" min="50" max="600" step="10" value="300"></label>
        <label>Velocity retention <input id="life-friction" type="number" min="0.1" max="0.98" step="0.01" value="0.85"></label>
        <label>Interaction matrix seed <input id="life-seed" type="number" min="0" max="4294967295" step="1" value="1"></label>
        <p class="eco-note">Changing the seed changes asymmetric category attraction and repulsion. Nearby particles repel; distant particles do not interact. The four-dimensional box has reflecting boundaries. Attraction controls category forces; repulsion controls the short-range core. Projection controls work while paused.</p>
      </fieldset>`)
      const proximity = root.current.querySelector('#proximity')?.closest('label')
      if (proximity) { if (proximity.nextElementSibling) (proximity.nextElementSibling as HTMLElement).hidden = true; (proximity as HTMLElement).style.display = 'none' }
    }
    const host = root.current
    let disposed = false
    let cleanup: (() => void) | undefined
    void import('../../features/ecosystem/network-webgpu.js').then(({ mountEcosystemNetworkGPU }) => {
      if (disposed) return
      cleanup = mountEcosystemNetworkGPU(host, {
        dataUrl: portalPath('/ecosystem-data/ecosystem-portal.json'),
        historyUrl: portalPath('/ecosystem-data/ecosystem-relationships.json'),
        apiPrefix: '/api/org/api/network', portalPath, renderer: four ? 'webgpu4d' : spatial ? 'webgpu3d' : 'webgpu',
      })
    }).catch(() => { if (!disposed) host.textContent = 'The network could not load. Reload to try again.' })
    return () => { disposed = true; cleanup?.() }
  }, [spatial, four])
  return <div ref={root} className="portal-ecosystem eco-page" />
}
