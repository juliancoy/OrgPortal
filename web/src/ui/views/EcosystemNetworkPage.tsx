import { useEffect, useRef } from 'react'
import { portalPath } from '../../config/portalBase'
import markup from '../../features/ecosystem/markup.html?raw'
import '../../features/ecosystem/network.css'
import { useNetworkViewport } from '../../features/ecosystem/useNetworkViewport'

export function EcosystemNetworkPage() {
  const root = useRef<HTMLDivElement>(null)
  useNetworkViewport(root)
  useEffect(() => {
    const legacyView = window.location.hash === '#network-events' ? 'events' : window.location.hash === '#network-table' ? 'relationships' : null
    if (legacyView) { window.location.replace(portalPath(`/ecosystem/network/${legacyView}`) + window.location.search); return }
    document.title = 'Organization ecosystem network'
    if (!root.current) return
    root.current.innerHTML = markup
    const host = root.current
    let disposed = false
    let cleanup: (() => void) | undefined
    void import('../../features/ecosystem/network.js').then(({ mountEcosystemNetwork }) => {
      if (disposed) return
      cleanup = mountEcosystemNetwork(host, {
        dataUrl: portalPath('/ecosystem-data/ecosystem-portal.json'),
        historyUrl: portalPath('/ecosystem-data/ecosystem-relationships.json'),
        apiPrefix: '/api/org/api/network', portalPath,
      })
    }).catch(() => { if (!disposed) host.textContent = 'The network could not load. Reload to try again.' })
    return () => { disposed = true; cleanup?.() }
  }, [])
  return <div ref={root} className="portal-ecosystem eco-page" />
}
