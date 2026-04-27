import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { pidpUrl } from '../../config/pidp'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'

type ApiTokenScope = 'service' | 'org_portal' | 'org_mcp' | 'org_admin'

type ApiTokenPublic = {
  id: string
  name: string
  scope: ApiTokenScope | string
  scope_grants?: string[]
  is_active: boolean
  created_at: string
  last_used_at?: string | null
}

type ApiTokenIssued = {
  token: string
  token_id: string
  name: string
  scope: ApiTokenScope | string
  scope_grants?: string[]
}

type PidpConfiguration = {
  google_client_id?: string | null
  google_redirect_uri?: string | null
  github_client_id?: string | null
  github_redirect_uri?: string | null
}

type TokenInfo = {
  token_kind?: 'pat' | 'jwt'
  scope?: string
  scope_grants?: string[]
}

type AccessSnapshot = {
  is_public?: boolean
  is_attendee?: boolean
  is_member?: boolean
  is_org_admin?: boolean
  is_sysadmin?: boolean
  reasons?: string[]
}

const DEFAULT_SCOPE_GRANTS: Record<ApiTokenScope, string[]> = {
  service: ['service:*'],
  org_portal: ['org:profile.read', 'org:profile.write', 'org:events.attend', 'org:chat.use'],
  org_mcp: ['org:mcp.use', 'org:profile.read', 'org:events.read'],
  org_admin: ['org:*', 'org:admin.read', 'org:admin.write', 'org:mcp.use'],
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Never'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function scopeGrantsForToken(token: ApiTokenPublic): string[] {
  if (Array.isArray(token.scope_grants) && token.scope_grants.length > 0) return token.scope_grants
  if (token.scope in DEFAULT_SCOPE_GRANTS) return DEFAULT_SCOPE_GRANTS[token.scope as ApiTokenScope]
  return []
}

export function DevToolsPage() {
  const { token } = useAuth()
  const [tokens, setTokens] = useState<ApiTokenPublic[]>([])
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null)
  const [accessSnapshot, setAccessSnapshot] = useState<AccessSnapshot | null>(null)
  const [pidpConfig, setPidpConfig] = useState<PidpConfiguration | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const [createName, setCreateName] = useState('')
  const [createScope, setCreateScope] = useState<ApiTokenScope>('org_portal')
  const [createBusy, setCreateBusy] = useState(false)

  const [renameBusyId, setRenameBusyId] = useState<string | null>(null)
  const [recycleBusyId, setRecycleBusyId] = useState<string | null>(null)
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null)
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({})
  const [issuedSecret, setIssuedSecret] = useState<ApiTokenIssued | null>(null)

  const origin = window.location.origin
  const orgApiBase = `${origin}/api/org`
  const mcpEndpoint = `${origin}/api/org/mcp`

  const scopeOptions: ApiTokenScope[] = ['service', 'org_portal', 'org_mcp', 'org_admin']

  useEffect(() => {
    document.title = 'Org Portal • Dev Tools'
  }, [])

  const canCreate = useMemo(() => createName.trim().length > 0 && !createBusy, [createBusy, createName])

  async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
    let authToken = token || null
    if (!authToken) {
      authToken = await refreshRuntimeTokenFromSession()
    }
    if (!authToken) return new Response('Authentication required', { status: 401 })

    const requestWithToken = (value: string) => {
      const headers = new Headers(init.headers || {})
      headers.set('Authorization', `Bearer ${value}`)
      return fetch(url, { ...init, headers, credentials: 'include' })
    }

    let resp = await requestWithToken(authToken)
    if (resp.status === 401) {
      const refreshed = await refreshRuntimeTokenFromSession()
      if (refreshed) {
        resp = await requestWithToken(refreshed)
      }
    }
    return resp
  }

  async function loadPanel() {
    setLoading(true)
    setStatus(null)
    try {
      const [tokenResp, configResp, tokenInfoResp, authzResp] = await Promise.all([
        authFetch(pidpUrl('/auth/tokens')),
        fetch(pidpUrl('/configuration'), { credentials: 'include' }),
        authFetch(pidpUrl('/service/token-info')),
        authFetch('/api/org/api/authz/me'),
      ])

      if (!tokenResp.ok) {
        const text = await tokenResp.text().catch(() => '')
        throw new Error(text || `Failed to load API tokens (${tokenResp.status})`)
      }

      const tokenRows = (await tokenResp.json()) as ApiTokenPublic[]
      setTokens(Array.isArray(tokenRows) ? tokenRows : [])
      setRenameDrafts((prev) => {
        const next: Record<string, string> = {}
        for (const item of tokenRows || []) {
          next[item.id] = prev[item.id] ?? item.name
        }
        return next
      })

      if (configResp.ok) {
        const config = (await configResp.json()) as PidpConfiguration
        setPidpConfig(config)
      } else {
        setPidpConfig(null)
      }

      if (tokenInfoResp.ok) {
        const info = (await tokenInfoResp.json()) as TokenInfo
        setTokenInfo(info)
      } else {
        setTokenInfo(null)
      }

      if (authzResp.ok) {
        const snapshot = (await authzResp.json()) as AccessSnapshot
        setAccessSnapshot(snapshot)
      } else {
        setAccessSnapshot(null)
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load developer tools panel.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPanel().catch(() => {})
  }, [token])

  async function handleCreateToken(event: React.FormEvent) {
    event.preventDefault()
    const name = createName.trim()
    if (!name) return
    setCreateBusy(true)
    setStatus(null)
    try {
      const resp = await authFetch(pidpUrl('/auth/tokens'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, scope: createScope }),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Failed to create token (${resp.status})`)
      }
      const issued = (await resp.json()) as ApiTokenIssued
      setIssuedSecret(issued)
      setCreateName('')
      setStatus('Token created. Copy the secret now.')
      await loadPanel()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to create token.')
    } finally {
      setCreateBusy(false)
    }
  }

  async function handleRenameToken(tokenId: string) {
    const nextName = (renameDrafts[tokenId] || '').trim()
    if (!nextName) {
      setStatus('Token name cannot be empty.')
      return
    }
    setRenameBusyId(tokenId)
    setStatus(null)
    try {
      const resp = await authFetch(pidpUrl(`/auth/tokens/${encodeURIComponent(tokenId)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName }),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Failed to rename token (${resp.status})`)
      }
      setStatus('Token renamed.')
      await loadPanel()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to rename token.')
    } finally {
      setRenameBusyId(null)
    }
  }

  async function handleRecycleToken(tokenId: string) {
    setRecycleBusyId(tokenId)
    setStatus(null)
    try {
      const resp = await authFetch(pidpUrl(`/auth/tokens/${encodeURIComponent(tokenId)}/cycle`), {
        method: 'POST',
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Failed to cycle token (${resp.status})`)
      }
      const issued = (await resp.json()) as ApiTokenIssued
      setIssuedSecret(issued)
      setStatus('Token cycled. Copy the new secret now.')
      await loadPanel()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to cycle token.')
    } finally {
      setRecycleBusyId(null)
    }
  }

  async function handleDeleteToken(tokenId: string) {
    if (!window.confirm('Delete (revoke) this token?')) return
    setDeleteBusyId(tokenId)
    setStatus(null)
    try {
      const resp = await authFetch(pidpUrl(`/auth/tokens/${encodeURIComponent(tokenId)}`), {
        method: 'DELETE',
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Failed to delete token (${resp.status})`)
      }
      setStatus('Token deleted.')
      await loadPanel()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to delete token.')
    } finally {
      setDeleteBusyId(null)
    }
  }

  async function copyIssuedSecret() {
    const value = issuedSecret?.token || ''
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setStatus('Token copied to clipboard.')
    } catch {
      setStatus('Unable to copy token to clipboard.')
    }
  }

  return (
    <div className="portal-section devtools-shell">
      <section className="panel">
        <div className="portal-section-header">
          <div>
            <h1 style={{ margin: 0 }}>Dev Tools Admin Panel</h1>
            <p className="muted" style={{ margin: '0.4rem 0 0 0' }}>
              Single-page PAT and OAuth operations with live inventory and lifecycle controls.
            </p>
          </div>
          <button className="btn-secondary" onClick={() => loadPanel()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {status ? (
          <div className="portal-card devtools-status" role="status">
            {status}
          </div>
        ) : null}

        {issuedSecret ? (
          <div className="portal-card devtools-issued-secret">
            <div>
              <strong>New token secret (shown once)</strong>
              <div className="muted" style={{ marginTop: 4 }}>
                Name: <code>{issuedSecret.name}</code> • Scope: <code>{issuedSecret.scope}</code>
              </div>
            </div>
            <code className="devtools-secret-value">{issuedSecret.token}</code>
            <div className="devtools-action-row">
              <button className="btn-primary" onClick={copyIssuedSecret}>
                Copy Secret
              </button>
              <button className="btn-secondary" onClick={() => setIssuedSecret(null)}>
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="portal-section-header">
          <h2 style={{ margin: 0 }}>PAT Inventory</h2>
          <span className="portal-pill">{tokens.length} total</span>
        </div>

        <form className="portal-form devtools-create-form" onSubmit={handleCreateToken}>
          <label>
            New token name
            <input
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="e.g. portal-bot-prod"
              maxLength={120}
            />
          </label>
          <label>
            Scope
            <select value={createScope} onChange={(event) => setCreateScope(event.target.value as ApiTokenScope)}>
              {scopeOptions.map((scope) => (
                <option key={scope} value={scope}>
                  {scope}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary" type="submit" disabled={!canCreate}>
            {createBusy ? 'Creating...' : 'Create PAT'}
          </button>
        </form>

        <div className="devtools-token-list">
          {tokens.map((item) => {
            const grants = scopeGrantsForToken(item)
            const renameBusy = renameBusyId === item.id
            const recycleBusy = recycleBusyId === item.id
            const deleteBusy = deleteBusyId === item.id
            return (
              <article className="portal-card devtools-token-card" key={item.id}>
                <div className="devtools-token-head">
                  <div className="devtools-token-meta">
                    <strong>{item.name}</strong>
                    <span className="portal-pill">{item.scope}</span>
                    <span className={`portal-pill ${item.is_active ? 'devtools-pill-active' : 'devtools-pill-revoked'}`}>
                      {item.is_active ? 'active' : 'revoked'}
                    </span>
                  </div>
                  <code className="devtools-token-id">{item.id}</code>
                </div>

                <div className="devtools-token-grid">
                  <div>
                    <div className="muted">Created</div>
                    <div>{formatDateTime(item.created_at)}</div>
                  </div>
                  <div>
                    <div className="muted">Last used</div>
                    <div>{formatDateTime(item.last_used_at)}</div>
                  </div>
                </div>

                <div>
                  <div className="muted">Permissions</div>
                  <div className="devtools-grants">
                    {grants.length > 0 ? grants.map((grant) => <code key={grant}>{grant}</code>) : <span className="muted">None</span>}
                  </div>
                </div>

                <div className="devtools-token-actions">
                  <label>
                    Rename
                    <input
                      value={renameDrafts[item.id] || ''}
                      onChange={(event) => setRenameDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))}
                      maxLength={120}
                    />
                  </label>
                  <button className="btn-secondary" onClick={() => handleRenameToken(item.id)} disabled={renameBusy}>
                    {renameBusy ? 'Renaming...' : 'Rename'}
                  </button>
                  <button className="btn-secondary" onClick={() => handleRecycleToken(item.id)} disabled={recycleBusy}>
                    {recycleBusy ? 'Cycling...' : 'Recycle'}
                  </button>
                  <button className="btn-secondary" onClick={() => handleDeleteToken(item.id)} disabled={deleteBusy}>
                    {deleteBusy ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </article>
            )
          })}
          {tokens.length === 0 ? (
            <div className="portal-card">
              <div className="muted">No PATs found for this account.</div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="portal-grid">
        <article className="portal-card">
          <h2 style={{ marginTop: 0 }}>OAuth Keys</h2>
          <p className="muted">Configured OAuth provider client keys from PIdP.</p>
          <div className="devtools-kv-list">
            <div>
              <strong>Google Client ID</strong>
              <code>{pidpConfig?.google_client_id || 'Not configured'}</code>
            </div>
            <div>
              <strong>Google Redirect URI</strong>
              <code>{pidpConfig?.google_redirect_uri || 'Not configured'}</code>
            </div>
            <div>
              <strong>GitHub Client ID</strong>
              <code>{pidpConfig?.github_client_id || 'Not configured'}</code>
            </div>
            <div>
              <strong>GitHub Redirect URI</strong>
              <code>{pidpConfig?.github_redirect_uri || 'Not configured'}</code>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            OAuth client secrets are intentionally not exposed by API.
          </p>
        </article>

        <article className="portal-card">
          <h2 style={{ marginTop: 0 }}>Runtime Auth</h2>
          <p className="muted">Current credential context resolved by PIdP token introspection.</p>
          <div className="devtools-kv-list">
            <div>
              <strong>Token kind</strong>
              <code>{tokenInfo?.token_kind || 'Unknown'}</code>
            </div>
            <div>
              <strong>Active scope</strong>
              <code>{tokenInfo?.scope || 'Unknown'}</code>
            </div>
              <div>
                <strong>Scope grants</strong>
                <div className="devtools-grants">
                {(tokenInfo?.scope_grants || []).map((grant) => (
                  <code key={grant}>{grant}</code>
                ))}
                {(tokenInfo?.scope_grants || []).length === 0 ? <span className="muted">None</span> : null}
                </div>
              </div>
              <div>
                <strong>Org Access Classes</strong>
                <div className="devtools-grants">
                  <code>sysadmin:{String(Boolean(accessSnapshot?.is_sysadmin))}</code>
                  <code>org_admin:{String(Boolean(accessSnapshot?.is_org_admin))}</code>
                  <code>member:{String(Boolean(accessSnapshot?.is_member))}</code>
                  <code>attendee:{String(Boolean(accessSnapshot?.is_attendee))}</code>
                </div>
              </div>
            </div>
          </article>

        <article className="portal-card">
          <h2 style={{ marginTop: 0 }}>Endpoints</h2>
          <div className="devtools-kv-list">
            <div>
              <strong>Org API</strong>
              <code>{orgApiBase}</code>
            </div>
            <div>
              <strong>MCP</strong>
              <code>{mcpEndpoint}</code>
            </div>
            <div>
              <strong>PIdP profile</strong>
              <code>{pidpUrl('/profile')}</code>
            </div>
          </div>
          <div className="devtools-action-row">
            <Link className="btn-secondary" to="/tools/business-cards">
              Business Card Intake
            </Link>
            <Link className="btn-secondary" to="/admin">
              SysAdmin
            </Link>
            <Link className="btn-secondary" to="/chat">
              Chat
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}
