import { useEffect, useRef, useState } from 'react'
import { pidpSingleSignOnUrl, pidpUrl } from '../../config/pidp'
import { portalPath } from '../../config/portalBase'

type GoogleIdentity = {
  initialize: (options: { client_id: string; callback: (response: { credential: string }) => void; auto_select: boolean; use_fedcm_for_button: boolean; button_auto_select: boolean }) => void
  renderButton: (element: HTMLElement, options: { type: string; theme: string; size: string; text: string; width: number }) => void
}

function googleIdentity(): GoogleIdentity | undefined {
  return (window as Window & { google?: { accounts?: { id?: GoogleIdentity } } }).google?.accounts?.id
}

function personalizedGoogleAllowed(): boolean {
  // Google has no button API for reliably detecting an unauthorized origin.
  // Enable the widget only on origins explicitly registered with Google.
  const configured = import.meta.env.VITE_GOOGLE_PERSONALIZED_ORIGINS as string | undefined
  const origins = (configured ?? 'https://lifetech.fyi').split(',').map(origin => origin.trim())
  return origins.includes(window.location.origin)
}

function loadGoogleIdentity(): Promise<void> {
  if (googleIdentity()) return Promise.resolve()
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]')
    if (!script) {
      script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      document.head.appendChild(script)
    }
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error('Google sign-in unavailable')) }, 10000)
    function cleanup() { window.clearTimeout(timeout); script?.removeEventListener('load', loaded); script?.removeEventListener('error', failed) }
    function loaded() { cleanup(); resolve() }
    function failed() { cleanup(); reject(new Error('Google sign-in unavailable')) }
    script.addEventListener('load', loaded)
    script.addEventListener('error', failed)
  })
}

// This is a branded sign-in entry point. PIdP owns the actual authentication.
export function GoogleLoginEntry({ next }: { next: string }) {
  const buttonRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!personalizedGoogleAllowed()) return
    let cancelled = false
    const controller = new AbortController()
    async function render() {
      const response = await fetch(pidpUrl('/configuration'), { signal: controller.signal })
      if (!response.ok) return
      const config = await response.json() as { google_client_id?: string }
      if (!config.google_client_id || cancelled) return
      await loadGoogleIdentity()
      const identity = googleIdentity()
      if (!identity || !buttonRef.current || cancelled) return
      identity.initialize({
        client_id: config.google_client_id,
        auto_select: false,
        use_fedcm_for_button: true,
        button_auto_select: false,
        callback: ({ credential }) => {
          if (cancelled) return
          let subject: string | undefined
          try {
            // Unverified subject used ONLY as an OAuth UI hint. Never log/store
            // the credential or create a session/identity from these claims.
            const payload = credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
            const claims = JSON.parse(atob(payload)) as { sub?: unknown }
            if (typeof claims.sub === 'string' && /^[0-9]{1,255}$/.test(claims.sub)) subject = claims.sub
          } catch { /* Continue through normal OAuth without a hint. */ }
          window.location.assign(pidpSingleSignOnUrl(next, 'google', subject))
        },
      })
      identity.renderButton(buttonRef.current, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', width: Math.min(400, Math.max(200, buttonRef.current.parentElement?.clientWidth || 200)) })
      setReady(buttonRef.current.childElementCount > 0)
    }
    void render().catch(() => { /* Keep the standard OAuth link available. */ })
    return () => { cancelled = true; controller.abort() }
  }, [next])
  return <div className="portal-google-login-entry">
    <div ref={buttonRef} className="portal-google-personalized-button" hidden={!ready} />
    <a href={pidpSingleSignOnUrl(next, 'google')} className="portal-social-login-button" aria-label="Continue with Google">
      <img src={portalPath('/images/google-g-logo.svg')} alt="" className="portal-social-login-logo" />
      <span>{ready ? 'Use standard Google sign-in' : 'Continue with Google'}</span>
    </a>
  </div>
}
