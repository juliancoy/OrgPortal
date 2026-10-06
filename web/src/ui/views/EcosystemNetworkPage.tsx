import { useEffect, useRef } from 'react'
import { portalPath } from '../../config/portalBase'
import markup from '../../features/ecosystem/markup.html?raw'
import '../../features/ecosystem/network.css'

export function EcosystemNetworkPage() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    document.title = 'Organization ecosystem network'
    if (!root.current) return
    root.current.innerHTML = markup
    const host = root.current
    const documentRoot = document.documentElement
    documentRoot.classList.add('eco-map-open')
    window.scrollTo(0, 0)
    const header = document.querySelector('.portal-header, .tb-shell-header')
    const measureHeader = () => host.style.setProperty('--eco-header-height', `${Math.max(0, header?.getBoundingClientRect().bottom || 0)}px`)
    measureHeader()
    const headerObserver = new ResizeObserver(measureHeader)
    if (header) headerObserver.observe(header)
    window.addEventListener('resize', measureHeader)
    let disposed = false
    let cleanup: (() => void) | undefined
    void import('../../features/ecosystem/network.js').then(({ mountEcosystemNetwork }) => {
      if (disposed) return
      cleanup = mountEcosystemNetwork(host, {
        dataUrl: portalPath('/ecosystem-data/ecosystem-portal.json'),
        historyUrl: portalPath('/ecosystem-data/ecosystem-history.json'),
        apiPrefix: '/api/org/api/network', portalPath,
      })
    }).catch(() => { if (!disposed) host.textContent = 'The network could not load. Reload to try again.' })
    return () => { disposed = true; cleanup?.(); headerObserver.disconnect(); window.removeEventListener('resize', measureHeader); documentRoot.classList.remove('eco-map-open') }
  }, [])
  return <div ref={root} className="portal-ecosystem eco-page" />
}
