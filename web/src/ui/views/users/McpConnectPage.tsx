import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { pidpUrl } from '../../../config/pidp'
import { portalPath } from '../../../config/portalBase'
import { useAuth } from '../../../app/AppProviders'
import './McpConnectPage.css'

type Connection = { portal: string; portal_origin: string; issuer: string; account: string }

export function McpConnectPage() {
  const { logout } = useAuth()
  const [params] = useSearchParams()
  const request = params.getAll('request').length === 1 ? params.get('request') || '' : ''
  const [connection, setConnection] = useState<Connection | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setConnection(null)
    setError('')
    if (!/^login_[A-Za-z0-9_-]{43,100}$/.test(request)) {
      setError('This connection link is invalid. Start sign-in again from your MCP client.')
      return
    }
    void fetch(pidpUrl(`/oauth/mcp/handoff?${new URLSearchParams({ request })}`), {
      credentials: 'include', signal: controller.signal, cache: 'no-store',
    }).then(async response => {
      if (!response.ok) throw new Error('This connection link has expired or your sign-in is no longer active. Start sign-in again from your MCP client.')
      const data: Connection = await response.json()
      if (data.portal_origin !== window.location.origin || new URL(data.issuer).protocol !== 'https:') {
        throw new Error('This connection belongs to a different portal.')
      }
      if (!controller.signal.aborted) setConnection(data)
    }).catch(err => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load the connection.')
    })
    return () => controller.abort()
  }, [request])

  async function connect() {
    if (busy || !connection) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(pidpUrl('/oauth/mcp/handoff'), {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ request }),
      })
      if (!response.ok) throw new Error('Unable to continue. Start sign-in again from your MCP client.')
      const data = await response.json() as { redirect_url: string }
      const target = new URL(data.redirect_url)
      if (target.origin !== connection.issuer || target.pathname !== '/oauth/mcp/resume' || target.hash || target.username || target.password) {
        throw new Error('The identity provider returned an invalid destination.')
      }
      window.location.assign(target.toString())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to continue.')
      setBusy(false)
    }
  }

  return <section className="portal-auth-page mcp-connect" aria-labelledby="mcp-connect-title">
    <div className="portal-auth-card mcp-connect-card">
      <header className="mcp-connect-heading">
        <p className="mcp-connect-eyebrow">Account connection</p>
        <h1 id="mcp-connect-title">Connect {connection?.portal || 'your account'}</h1>
        <p className="mcp-connect-description">Confirm your account. You’ll review permissions on the next screen.</p>
      </header>
      {error && <p className="mcp-connect-error" role="alert">{error}</p>}
      {!connection && !error && <p className="mcp-connect-loading" role="status">Loading your account…</p>}
      {connection && <>
        <div className="mcp-connect-account">
          <span className="mcp-connect-avatar" aria-hidden="true">{connection.account.slice(0, 1).toUpperCase()}</span>
          <div className="mcp-connect-account-details">
            <span className="mcp-connect-label">Signed in as</span>
            <strong>{connection.account}</strong>
            <button className="mcp-connect-switch" type="button" disabled={busy} onClick={logout}>Use a different account</button>
          </div>
        </div>
        <dl className="mcp-connect-provider">
          <dt>Sign-in provider</dt>
          <dd>{new URL(connection.issuer).host}</dd>
        </dl>
      </>}
      <div className="mcp-connect-actions">
        {connection && <button className="mcp-connect-continue" type="button" disabled={busy} aria-busy={busy} onClick={() => void connect()}>
          {busy ? 'Connecting…' : 'Continue to consent'}
          <span aria-hidden="true">→</span>
        </button>}
        <a href={portalPath('/')} className="mcp-connect-cancel">Cancel</a>
      </div>
    </div>
  </section>
}
