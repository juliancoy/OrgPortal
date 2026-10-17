import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { portalPath } from '../../config/portalBase'
import markup from '../../features/ecosystem/markup.html?raw'
import '../../features/ecosystem/network.css'
import { useNetworkViewport } from '../../features/ecosystem/useNetworkViewport'

type NetworkRenderer = 'canvas' | 'webgpu' | 'webgpu3d' | 'webgpu4d'

export function EcosystemNetworkPage({ renderer = 'canvas' }: { renderer?: NetworkRenderer }) {
  const spatial = renderer === 'webgpu3d', four = renderer === 'webgpu4d'
  const navigate = useNavigate()
  const practice = new URLSearchParams(useLocation().search).get('practice') === '4d'
  const search = useRef('')
  const root = useRef<HTMLDivElement>(null)
  useNetworkViewport(root)
  useEffect(() => {
    const host = root.current
    if (!host) return
    const switchVisualization = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      const practiceButton = event.target instanceof Element ? event.target.closest('[data-practice-4d],[data-practice-exit]') : null
      if (practiceButton && host.contains(practiceButton)) {
        event.preventDefault()
        const params = new URLSearchParams(window.location.search)
        if (practiceButton.hasAttribute('data-practice-4d')) params.set('practice', '4d')
        else params.delete('practice')
        navigate(`${window.location.pathname}?${params}`)
        return
      }
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-graph-type]') : null
      if (!link || !host.contains(link)) return
      event.preventDefault()
      const url = new URL(link.href)
      if (url.pathname === window.location.pathname) return
      const params = new URLSearchParams(window.location.search)
      params.set('panel', 'visualization')
      navigate(`${url.pathname}?${params}`)
    }
    host.addEventListener('click', switchVisualization)
    return () => host.removeEventListener('click', switchVisualization)
  }, [navigate])
  useEffect(() => {
    if (practice && root.current) {
      document.title = '4D navigation practice'
      const host = root.current
      let disposed = false
      let cleanup: (() => void) | undefined
      void import('../../features/ecosystem/navigation-practice.js').then(({ mountNavigationPractice }) => {
        if (!disposed) cleanup = mountNavigationPractice(host)
      }).catch(() => { if (!disposed) host.textContent = 'Navigation practice could not load.' })
      return () => { disposed = true; cleanup?.() }
    }
    document.title = four ? 'Organization network · 4D Particle Life' : spatial ? 'Organization network · 3D WebGPU' : renderer === 'webgpu' ? 'Organization ecosystem network · WebGPU' : 'Organization ecosystem network'
    if (!root.current) return
    root.current.innerHTML = markup.replace('Organization network</h1>', `Organization network · ${four ? '4D Particle Life' : spatial ? '3D WebGPU' : renderer === 'webgpu' ? 'WebGPU' : '2D'}</h1>`)
    root.current.querySelector<HTMLInputElement>('#network-search')!.value = search.current
    if (four) {
      const controls = root.current.querySelector('.eco-network-controls')!
      controls.insertAdjacentHTML('afterbegin', `<fieldset><legend>4D Particle Life</legend><p>W position (world units): <output id="life-w-position">0.00</output></p>
        ${['xw','yw','zw'].map(axis => `<label class="eco-slider-row"><span class="eco-slider-name">${axis.toUpperCase()} rotation</span><input id="life-${axis}" type="range" min="-180" max="180" step="1" value="0"><span class="eco-slider-value"><output id="life-${axis}-value">0</output>°</span></label>`).join('')}
        <label class="eco-slider-row"><span class="eco-slider-name">4D perspective</span><input id="life-perspective" type="range" min="0" max="0.8" step="0.01" value="0.35"><span class="eco-slider-value"><output id="life-perspective-value">0.35</output></span></label>
        <label>Interaction radius <input id="life-radius" type="number" min="50" max="600" step="10" value="300"></label>
        <label>Velocity retention <input id="life-friction" type="number" min="0.1" max="0.98" step="0.01" value="0.85"></label>
        <label>Interaction matrix seed <input id="life-seed" type="number" min="0" max="4294967295" step="1" value="1"></label>
      </fieldset>`)
      const proximity = root.current.querySelector('#proximity')?.closest('label')
      if (proximity) (proximity as HTMLElement).hidden = true
    }
    const host = root.current
    let disposed = false
    let cleanup: (() => void) | undefined
    void import('../../features/ecosystem/network-webgpu.js').then(({ mountEcosystemNetworkGPU }) => {
      if (disposed) return
      cleanup = mountEcosystemNetworkGPU(host, {
        dataUrl: portalPath('/ecosystem-data/ecosystem-portal.json'),
        historyUrl: portalPath('/ecosystem-data/ecosystem-relationships.json'),
        apiPrefix: '/api/org/api/network', portalPath, renderer,
      })
    }).catch(() => { if (!disposed) host.textContent = 'The network could not load. Reload to try again.' })
    return () => { disposed = true; search.current = host.querySelector<HTMLInputElement>('#network-search')?.value || ''; cleanup?.() }
  }, [renderer, spatial, four, practice])
  return <div ref={root} className="portal-ecosystem eco-page" />
}
