import {networkNDControls} from '../../features/ecosystem/nd-controls.js'
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
    document.title = four ? 'Organization network · N-dimensional relationship network' : spatial ? 'Organization network · 3D WebGPU' : renderer === 'webgpu' ? 'Organization ecosystem network · WebGPU' : 'Organization ecosystem network'
    if (!root.current) return
    root.current.innerHTML = markup.replace('Organization network</h1>', `Organization network · ${four ? 'N-dimensional relationship network' : spatial ? '3D WebGPU' : renderer === 'webgpu' ? 'WebGPU' : '2D'}</h1>`)
    root.current.querySelector<HTMLInputElement>('#network-search')!.value = search.current
    if (four) {
      const controls = root.current.querySelector('.eco-network-controls')!
      controls.insertAdjacentHTML('afterbegin', networkNDControls())
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
