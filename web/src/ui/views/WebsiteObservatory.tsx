import { useEffect, useRef } from 'react'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'

export function WebsiteObservatory({ token }: { token: string }) {
  const frame = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    const send = (value = token) => frame.current?.contentWindow?.postMessage({ type: 'orgportal-observatory-auth', token: value }, location.origin)
    const receive = async (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return
      if (event.data?.type === 'orgportal-observatory-ready') send()
      if (event.data?.type === 'orgportal-observatory-refresh') {
        const refreshed = await refreshRuntimeTokenFromSession()
        if (refreshed) send(refreshed)
      }
    }
    window.addEventListener('message', receive)
    send()
    return () => window.removeEventListener('message', receive)
  }, [token])
  return <section className="portal-card" aria-label="Website request observatory">
    <h2>Website request observatory</h2>
    <p className="muted">Private synthetic request maps for CodeCollective and LifeTech. Captures run on the connected probe; reports and history are hosted by OrgPortal.</p>
    <iframe ref={frame} src="/website-observatory/index.html" title="Website request observatory" style={{ width: '100%', height: '1100px', border: 0, borderRadius: 8 }} />
  </section>
}
