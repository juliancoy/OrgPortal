import { useMemo, useState } from 'react'
import { externalBrowserUrl, isIosUserAgent, isLinkedInInAppBrowser } from '../../infrastructure/platform/inAppBrowser'

export function ExternalBrowserPrompt() {
  const [copied, setCopied] = useState(false)
  const userAgent = globalThis.navigator?.userAgent || ''
  const currentUrl = globalThis.location?.href || ''
  const shouldShow = isLinkedInInAppBrowser(userAgent)
  const openUrl = useMemo(() => (currentUrl ? externalBrowserUrl(currentUrl, userAgent) : ''), [currentUrl, userAgent])
  const isIos = isIosUserAgent(userAgent)

  if (!shouldShow || !currentUrl) return null

  async function copyCurrentUrl() {
    try {
      await navigator.clipboard.writeText(currentUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <aside className="external-browser-prompt" role="status" aria-live="polite">
      <div>
        <strong>Open in your browser to sign in</strong>
        <p>
          Google sign-in can be blocked inside LinkedIn. Open this page in Chrome or Safari before continuing.
        </p>
        {isIos ? (
          <p className="external-browser-prompt-note">
            If the button does not open a browser, copy the link and paste it into Safari.
          </p>
        ) : null}
      </div>
      <div className="external-browser-prompt-actions">
        <a className="btn-primary" href={openUrl}>
          Open in browser
        </a>
        <button type="button" onClick={copyCurrentUrl}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </aside>
  )
}
