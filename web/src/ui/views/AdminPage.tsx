import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import './admin.css'
import { useAuth } from '../../app/AppProviders'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'
import { WebsiteObservatory } from './WebsiteObservatory'
import { VisitorStatistics } from './VisitorStatistics'

const ORG_API_BASE = '/api/org'

type AdminTabKey = 'abuse' | 'stats' | 'users' | 'ops'

type OwnershipChallengeQueueItem = {
  id: string
  organization_id: string
  organization_name: string
  organization_slug: string
  owner_user_id?: string | null
  challenger_user_id: string
  challenger_email?: string | null
  challenger_name?: string | null
  explanation: string
  status: 'open' | 'withdrawn' | 'resolved' | string
  resolution?: 'incumbent' | 'challenger' | null
  resolved_by_user_id?: string | null
  resolved_at?: string | null
  created_at: string
}

type BusinessCardAbuseSettings = {
  enabled: boolean
  per_user_limit_per_hour: number
  per_ip_limit_per_hour: number
  global_limit_per_hour: number
  duplicate_hash_limit: number
  duplicate_hash_window_seconds: number
  max_bytes: number
  allowed_content_types: string[]
  auto_clarification_enabled: boolean
  auto_min_confidence: number
  auto_min_margin: number
  updated_at: string
  updated_by?: string | null
}

type BusinessCardAbuseSettingsForm = {
  enabled: boolean
  per_user_limit_per_hour: string
  per_ip_limit_per_hour: string
  global_limit_per_hour: string
  duplicate_hash_limit: string
  duplicate_hash_window_seconds: string
  max_bytes: string
  allowed_content_types_csv: string
  auto_clarification_enabled: boolean
  auto_min_confidence: string
  auto_min_margin: string
}

type AccountListItem = {
  id: string
  entity_type: 'individual' | 'business' | 'nonprofit' | string
  name: string
  email: string
  balance: string | number
  created_at: string
}

type SystemMetricsResponse = Record<string, string | number | null>

type NetworkAuditEvent = {
  id: string
  actor_user_id?: string | null
  actor_email?: string | null
  action: string
  resource_type: string
  resource_id: string
  metadata: Record<string, unknown>
  created_at: string
}

type StatsState = {
  metrics: SystemMetricsResponse | null
  orgCount: number
  eventCount: number
  motionCount: number
  auditEvents: NetworkAuditEvent[]
}

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

function formatDateTime(value?: string | null) {
  if (!value) return 'N/A'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function createBusinessCardForm(settings: BusinessCardAbuseSettings): BusinessCardAbuseSettingsForm {
  return {
    enabled: settings.enabled,
    per_user_limit_per_hour: String(settings.per_user_limit_per_hour),
    per_ip_limit_per_hour: String(settings.per_ip_limit_per_hour),
    global_limit_per_hour: String(settings.global_limit_per_hour),
    duplicate_hash_limit: String(settings.duplicate_hash_limit),
    duplicate_hash_window_seconds: String(settings.duplicate_hash_window_seconds),
    max_bytes: String(settings.max_bytes),
    allowed_content_types_csv: (settings.allowed_content_types || []).join(','),
    auto_clarification_enabled: settings.auto_clarification_enabled ?? true,
    auto_min_confidence: String(settings.auto_min_confidence ?? 0.75),
    auto_min_margin: String(settings.auto_min_margin ?? 0.2),
  }
}

function metricValue(metrics: SystemMetricsResponse | null, key: string): string {
  if (!metrics || metrics[key] === undefined || metrics[key] === null) return '0'
  const raw = metrics[key]
  if (typeof raw === 'number') return raw.toLocaleString()
  const asNumber = Number(raw)
  if (Number.isFinite(asNumber)) return asNumber.toLocaleString()
  return String(raw)
}

export function AdminPage() {
  const { token } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const tab: AdminTabKey = requestedTab === 'stats' || requestedTab === 'users' || requestedTab === 'ops' ? requestedTab : 'abuse'
  function setTab(next: AdminTabKey) {
    setSearchParams(previous => {
      const params = new URLSearchParams(previous)
      params.set('tab', next)
      return params
    })
  }
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  const [claimRequests, setClaimRequests] = useState<OwnershipChallengeQueueItem[]>([])
  const [claimQueueStatus, setClaimQueueStatus] = useState<string | null>(null)
  const [claimQueueLoading, setClaimQueueLoading] = useState(false)
  const [claimActionRunningId, setClaimActionRunningId] = useState<string | null>(null)

  const [businessCardSettings, setBusinessCardSettings] = useState<BusinessCardAbuseSettings | null>(null)
  const [businessCardForm, setBusinessCardForm] = useState<BusinessCardAbuseSettingsForm | null>(null)
  const [businessCardLoading, setBusinessCardLoading] = useState(false)
  const [businessCardSaving, setBusinessCardSaving] = useState(false)
  const [businessCardStatus, setBusinessCardStatus] = useState<string | null>(null)

  const [stats, setStats] = useState<StatsState | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsStatus, setStatsStatus] = useState<string | null>(null)

  const [userQuery, setUserQuery] = useState('')
  const [users, setUsers] = useState<AccountListItem[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersStatus, setUsersStatus] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Org Portal • SysAdmin'
  }, [])

  async function fetchWithTokenRefresh(path: string, init: RequestInit = {}): Promise<Response> {
    if (!token) {
      return new Response('Authentication required', { status: 401 })
    }
    const requestWithToken = (authToken: string) => {
      const headers = new Headers(init.headers || {})
      headers.set('Authorization', `Bearer ${authToken}`)
      return fetch(orgUrl(path), { ...init, headers })
    }
    let response = await requestWithToken(token)
    if (response.status === 401) {
      const refreshed = await refreshRuntimeTokenFromSession()
      if (refreshed) {
        response = await requestWithToken(refreshed)
      }
    }
    return response
  }

  useEffect(() => {
    if (!token) {
      setIsAdmin(false)
      return
    }
    fetchWithTokenRefresh('/admin/me')
      .then((resp) => (resp.ok ? resp.json() : { is_sysadmin: false }))
      .then((data) => setIsAdmin(Boolean(data.is_sysadmin)))
      .catch(() => setIsAdmin(false))
  }, [token])

  async function loadClaimQueue() {
    if (!token) {
      setClaimRequests([])
      setClaimQueueStatus('Login required.')
      return
    }
    setClaimQueueLoading(true)
    setClaimQueueStatus(null)
    try {
      const resp = await fetchWithTokenRefresh('/api/network/ownership-challenges?status=open&limit=500')
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Failed to load contested ownerships (${resp.status})`)
      }
      const rows = (await resp.json()) as OwnershipChallengeQueueItem[]
      setClaimRequests(Array.isArray(rows) ? rows : [])
    } catch (err) {
      setClaimRequests([])
      setClaimQueueStatus(err instanceof Error ? err.message : 'Failed to load contested ownerships.')
    } finally {
      setClaimQueueLoading(false)
    }
  }

  async function loadBusinessCardSettings() {
    if (!token) {
      setBusinessCardStatus('Login required.')
      return
    }
    setBusinessCardLoading(true)
    setBusinessCardStatus(null)
    try {
      const resp = await fetchWithTokenRefresh('/api/admin/business-card/settings')
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Failed to load business card settings (${resp.status})`)
      }
      const data = (await resp.json()) as BusinessCardAbuseSettings
      setBusinessCardSettings(data)
      setBusinessCardForm(createBusinessCardForm(data))
    } catch (err) {
      setBusinessCardStatus(err instanceof Error ? err.message : 'Failed to load business card settings.')
    } finally {
      setBusinessCardLoading(false)
    }
  }

  async function saveBusinessCardSettings() {
    if (!token) {
      setBusinessCardStatus('Login required.')
      return
    }
    if (!businessCardForm) return

    const parsed = {
      enabled: businessCardForm.enabled,
      per_user_limit_per_hour: Number(businessCardForm.per_user_limit_per_hour),
      per_ip_limit_per_hour: Number(businessCardForm.per_ip_limit_per_hour),
      global_limit_per_hour: Number(businessCardForm.global_limit_per_hour),
      duplicate_hash_limit: Number(businessCardForm.duplicate_hash_limit),
      duplicate_hash_window_seconds: Number(businessCardForm.duplicate_hash_window_seconds),
      max_bytes: Number(businessCardForm.max_bytes),
      allowed_content_types: businessCardForm.allowed_content_types_csv
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      auto_clarification_enabled: businessCardForm.auto_clarification_enabled,
      auto_min_confidence: Number(businessCardForm.auto_min_confidence),
      auto_min_margin: Number(businessCardForm.auto_min_margin),
    }

    const numericFields: Array<[string, number]> = [
      ['per_user_limit_per_hour', parsed.per_user_limit_per_hour],
      ['per_ip_limit_per_hour', parsed.per_ip_limit_per_hour],
      ['global_limit_per_hour', parsed.global_limit_per_hour],
      ['duplicate_hash_limit', parsed.duplicate_hash_limit],
      ['duplicate_hash_window_seconds', parsed.duplicate_hash_window_seconds],
      ['max_bytes', parsed.max_bytes],
    ]
    for (const [field, value] of numericFields) {
      if (!Number.isFinite(value) || value < 1) {
        setBusinessCardStatus(`Invalid value for ${field}.`)
        return
      }
    }
    if (parsed.allowed_content_types.length === 0) {
      setBusinessCardStatus('At least one allowed content type is required.')
      return
    }
    if (!Number.isFinite(parsed.auto_min_confidence) || parsed.auto_min_confidence < 0 || parsed.auto_min_confidence > 1) {
      setBusinessCardStatus('Auto minimum confidence must be between 0 and 1.')
      return
    }
    if (!Number.isFinite(parsed.auto_min_margin) || parsed.auto_min_margin < 0 || parsed.auto_min_margin > 1) {
      setBusinessCardStatus('Auto minimum margin must be between 0 and 1.')
      return
    }

    setBusinessCardSaving(true)
    setBusinessCardStatus(null)
    try {
      const resp = await fetchWithTokenRefresh('/api/admin/business-card/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(parsed),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Failed to save business card settings (${resp.status})`)
      }
      const updated = (await resp.json()) as BusinessCardAbuseSettings
      setBusinessCardSettings(updated)
      setBusinessCardForm(createBusinessCardForm(updated))
      setBusinessCardStatus('Business card abuse settings updated.')
    } catch (err) {
      setBusinessCardStatus(err instanceof Error ? err.message : 'Failed to save business card settings.')
    } finally {
      setBusinessCardSaving(false)
    }
  }

  async function loadStatistics() {
    if (!token) {
      setStatsStatus('Login required.')
      return
    }
    setStatsLoading(true)
    setStatsStatus(null)
    try {
      const [metricsResp, orgsResp, eventsResp, motionsResp, auditResp] = await Promise.all([
        fetchWithTokenRefresh('/api/system/metrics'),
        fetchWithTokenRefresh('/api/network/orgs/public?limit=500'),
        fetchWithTokenRefresh('/api/network/events/public?upcoming_only=false&limit=500'),
        fetchWithTokenRefresh('/api/governance/motions'),
        fetchWithTokenRefresh('/api/network/audit-events?limit=500'),
      ])

      if (!metricsResp.ok || !orgsResp.ok || !eventsResp.ok || !motionsResp.ok || !auditResp.ok) {
        throw new Error('Failed to load one or more statistics sources.')
      }

      const [metrics, orgs, events, motions, auditEvents] = await Promise.all([
        metricsResp.json() as Promise<SystemMetricsResponse>,
        orgsResp.json() as Promise<unknown[]>,
        eventsResp.json() as Promise<unknown[]>,
        motionsResp.json() as Promise<unknown[]>,
        auditResp.json() as Promise<NetworkAuditEvent[]>,
      ])

      setStats({
        metrics,
        orgCount: Array.isArray(orgs) ? orgs.length : 0,
        eventCount: Array.isArray(events) ? events.length : 0,
        motionCount: Array.isArray(motions) ? motions.length : 0,
        auditEvents: Array.isArray(auditEvents) ? auditEvents : [],
      })
    } catch (err) {
      setStats(null)
      setStatsStatus(err instanceof Error ? err.message : 'Failed to load statistics.')
    } finally {
      setStatsLoading(false)
    }
  }

  async function loadUsers(query: string) {
    if (!token) {
      setUsersStatus('Login required.')
      return
    }
    setUsersLoading(true)
    setUsersStatus(null)
    try {
      const q = encodeURIComponent(query.trim())
      const suffix = q ? `&q=${q}` : ''
      const resp = await fetchWithTokenRefresh(`/api/accounts?limit=2000&sort=name_asc${suffix}`)
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Failed to load users (${resp.status})`)
      }
      const rows = (await resp.json()) as AccountListItem[]
      const all = Array.isArray(rows) ? rows : []
      setUsers(all)
    } catch (err) {
      setUsers([])
      setUsersStatus(err instanceof Error ? err.message : 'Failed to load users.')
    } finally {
      setUsersLoading(false)
    }
  }

  async function reviewClaimRequest(challengeId: string, decision: 'incumbent' | 'challenger') {
    if (!token) {
      setClaimQueueStatus('Login required.')
      return
    }
    setClaimActionRunningId(challengeId)
    setClaimQueueStatus(null)
    try {
      const resp = await fetchWithTokenRefresh(`/api/network/ownership-challenges/${encodeURIComponent(challengeId)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Resolution failed (${resp.status})`)
      }
      setClaimQueueStatus(decision === 'challenger' ? 'Claimant selected as owner.' : 'Current ownership retained.')
      await loadClaimQueue()
    } catch (err) {
      setClaimQueueStatus(err instanceof Error ? err.message : 'Resolution failed.')
    } finally {
      setClaimActionRunningId(null)
    }
  }

  useEffect(() => {
    if (!isAdmin || !token) {
      return
    }
    if (tab === 'ops') void loadClaimQueue()
    if (tab === 'abuse') void loadBusinessCardSettings()
    if (tab === 'stats') void loadStatistics()
  }, [isAdmin, token, tab])

  useEffect(() => {
    if (!isAdmin || !token || tab !== 'users') return
    const timeout = window.setTimeout(() => {
      void loadUsers(userQuery)
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [userQuery, isAdmin, token, tab])

  const activeUsersLast7Days = useMemo(() => {
    if (!stats) return 0
    const threshold = Date.now() - 7 * 24 * 60 * 60 * 1000
    const set = new Set<string>()
    for (const row of stats.auditEvents) {
      const ts = new Date(row.created_at).getTime()
      if (!Number.isFinite(ts) || ts < threshold) continue
      if (row.actor_user_id) set.add(row.actor_user_id)
    }
    return set.size
  }, [stats])

  const topAuditEventTypes = useMemo(() => {
    if (!stats) return []
    const counts = new Map<string, number>()
    for (const row of stats.auditEvents) {
      counts.set(row.action, (counts.get(row.action) || 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
  }, [stats])

  const userCountLabel = users.length.toLocaleString()

  const tabItems: Array<{ key: AdminTabKey; label: string }> = [
    { key: 'abuse', label: 'Abuse Prevention' },
    { key: 'stats', label: 'Statistics' },
    { key: 'users', label: 'Users' },
    { key: 'ops', label: 'Operations' },
  ]

  if (isAdmin !== true) {
    return (
      <section className="portal-card sysadmin-page">
        <h1>Administration</h1>
        <p className="muted" role="status">{isAdmin === null ? 'Checking administrator access…' : 'You do not have access to this page.'}</p>
      </section>
    )
  }

  return (
    <section className="sysadmin-page" aria-labelledby="sysadmin-title">
      <header className="sysadmin-heading">
        <div>
          <span className="sysadmin-eyebrow">System administrator</span>
          <h1 id="sysadmin-title">Administration</h1>
          <p className="muted">Manage platform safety, review activity, and support your community.</p>
        </div>
        <div className="sysadmin-actions">
          <Link to="/admin/nametags" className="btn-secondary">Print nametags</Link>
          <Link to="/email" className="btn-secondary">Email campaigns</Link>
        </div>
      </header>

      <div className="sysadmin-workspace">
        <nav className="sysadmin-tabs" aria-label="Administration sections">
          {tabItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className="sysadmin-tab"
              aria-current={tab === item.key ? 'page' : undefined}
              aria-controls="sysadmin-content"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div id="sysadmin-content" className="sysadmin-content">
          {tab === 'abuse' ? (
            <>
              <div className="portal-card" style={{ display: 'grid', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: '1rem' }}>Business card protections</h2>
                  <button type="button" onClick={() => void loadBusinessCardSettings()} disabled={businessCardLoading || businessCardSaving}>
                    {businessCardLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>
                {businessCardStatus ? (
                  <p className="muted" role="status" style={{ margin: 0 }}>
                    {businessCardStatus}
                  </p>
                ) : null}
                {!businessCardForm ? (
                  <p className="muted" style={{ margin: 0 }}>
                    {businessCardLoading ? 'Loading settings…' : 'Settings unavailable.'}
                  </p>
                ) : (
                  <form
                    className="sysadmin-settings-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void saveBusinessCardSettings()
                    }}
                  >
                    <label className="sysadmin-check">
                      <span>Submissions enabled</span>
                      <input
                        type="checkbox"
                        checked={businessCardForm.enabled}
                        onChange={(event) =>
                          setBusinessCardForm((previous) =>
                            previous ? { ...previous, enabled: event.target.checked } : previous,
                          )
                        }
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.3rem' }}>
                      <span>Per-user/hour</span>
                      <input
                        type="number"
                        min={1}
                        value={businessCardForm.per_user_limit_per_hour}
                        onChange={(event) =>
                          setBusinessCardForm((previous) =>
                            previous ? { ...previous, per_user_limit_per_hour: event.target.value } : previous,
                          )
                        }
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.3rem' }}>
                      <span>Per-IP/hour</span>
                      <input
                        type="number"
                        min={1}
                        value={businessCardForm.per_ip_limit_per_hour}
                        onChange={(event) =>
                          setBusinessCardForm((previous) =>
                            previous ? { ...previous, per_ip_limit_per_hour: event.target.value } : previous,
                          )
                        }
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.3rem' }}>
                      <span>Global/hour</span>
                      <input
                        type="number"
                        min={1}
                        value={businessCardForm.global_limit_per_hour}
                        onChange={(event) =>
                          setBusinessCardForm((previous) =>
                            previous ? { ...previous, global_limit_per_hour: event.target.value } : previous,
                          )
                        }
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.3rem' }}>
                      <span>Duplicate hash limit</span>
                      <input
                        type="number"
                        min={1}
                        value={businessCardForm.duplicate_hash_limit}
                        onChange={(event) =>
                          setBusinessCardForm((previous) =>
                            previous ? { ...previous, duplicate_hash_limit: event.target.value } : previous,
                          )
                        }
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.3rem' }}>
                      <span>Duplicate window seconds</span>
                      <input
                        type="number"
                        min={60}
                        value={businessCardForm.duplicate_hash_window_seconds}
                        onChange={(event) =>
                          setBusinessCardForm((previous) =>
                            previous ? { ...previous, duplicate_hash_window_seconds: event.target.value } : previous,
                          )
                        }
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.3rem' }}>
                      <span>Max bytes</span>
                      <input
                        type="number"
                        min={102400}
                        value={businessCardForm.max_bytes}
                        onChange={(event) =>
                          setBusinessCardForm((previous) =>
                            previous ? { ...previous, max_bytes: event.target.value } : previous,
                          )
                        }
                      />
                    </label>
                    <label className="sysadmin-wide" style={{ display: 'grid', gap: '0.3rem' }}>
                      <span>Allowed content types (comma-separated)</span>
                      <input
                        type="text"
                        value={businessCardForm.allowed_content_types_csv}
                        onChange={(event) =>
                          setBusinessCardForm((previous) =>
                            previous ? { ...previous, allowed_content_types_csv: event.target.value } : previous,
                          )
                        }
                      />
                    </label>
                    <label className="sysadmin-check">
                      <input
                        type="checkbox"
                        checked={businessCardForm.auto_clarification_enabled}
                        onChange={(event) =>
                          setBusinessCardForm((previous) =>
                            previous ? { ...previous, auto_clarification_enabled: event.target.checked } : previous,
                          )
                        }
                      />
                      <span>Enable auto clarification checks</span>
                    </label>
                    <label style={{ display: 'grid', gap: '0.3rem' }}>
                      <span>Auto minimum confidence (0-1)</span>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={businessCardForm.auto_min_confidence}
                        onChange={(event) =>
                          setBusinessCardForm((previous) =>
                            previous ? { ...previous, auto_min_confidence: event.target.value } : previous,
                          )
                        }
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.3rem' }}>
                      <span>Auto minimum confidence margin (0-1)</span>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={businessCardForm.auto_min_margin}
                        onChange={(event) =>
                          setBusinessCardForm((previous) =>
                            previous ? { ...previous, auto_min_margin: event.target.value } : previous,
                          )
                        }
                      />
                    </label>
                    <div className="muted" style={{ fontSize: '0.85rem' }}>
                      Last updated: {formatDateTime(businessCardSettings?.updated_at)} by {businessCardSettings?.updated_by || 'unknown'}
                    </div>
                    <button type="submit" disabled={businessCardSaving || businessCardLoading}>
                      {businessCardSaving ? 'Saving…' : 'Save business card settings'}
                    </button>
                  </form>
                )}
              </div>
            </>
          ) : null}

          {tab === 'stats' ? (
            <>
              {token && <VisitorStatistics token={token} />}
              {token && <WebsiteObservatory token={token} />}
              <div className="portal-card" style={{ display: 'grid', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: '1rem' }}>Platform statistics</h2>
                  <button type="button" onClick={() => void loadStatistics()} disabled={statsLoading}>
                    {statsLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>
                {statsStatus ? (
                  <p className="muted" role="status" style={{ margin: 0 }}>{statsStatus}</p>
                ) : null}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                  <article className="portal-card" style={{ padding: '0.65rem', display: 'grid', gap: '0.2rem' }}>
                    <strong>{metricValue(stats?.metrics || null, 'total_accounts')}</strong>
                    <span className="muted">Ledger accounts</span>
                  </article>
                  <article className="portal-card" style={{ padding: '0.65rem', display: 'grid', gap: '0.2rem' }}>
                    <strong>{stats?.orgCount.toLocaleString() || '0'}</strong>
                    <span className="muted">Orgs loaded (up to 500)</span>
                  </article>
                  <article className="portal-card" style={{ padding: '0.65rem', display: 'grid', gap: '0.2rem' }}>
                    <strong>{stats?.eventCount.toLocaleString() || '0'}</strong>
                    <span className="muted">Events loaded (up to 500)</span>
                  </article>
                  <article className="portal-card" style={{ padding: '0.65rem', display: 'grid', gap: '0.2rem' }}>
                    <strong>{stats?.motionCount.toLocaleString() || '0'}</strong>
                    <span className="muted">Posts/Motions</span>
                  </article>
                  <article className="portal-card" style={{ padding: '0.65rem', display: 'grid', gap: '0.2rem' }}>
                    <strong>{activeUsersLast7Days.toLocaleString()}</strong>
                    <span className="muted">Actors in loaded audit events (7d)</span>
                  </article>
                  <article className="portal-card" style={{ padding: '0.65rem', display: 'grid', gap: '0.2rem' }}>
                    <strong>{stats?.auditEvents.length.toLocaleString() || '0'}</strong>
                    <span className="muted">Audit events loaded (up to 500)</span>
                  </article>
                </div>
              </div>

              <div className="portal-card" style={{ display: 'grid', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Recent activity</h3>
                {topAuditEventTypes.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>No audit activity found.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '0.3rem' }}>
                    {topAuditEventTypes.map(([eventType, count]) => (
                      <div key={eventType} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem' }}>
                        <span>{eventType}</span>
                        <strong>{count.toLocaleString()}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}

          {tab === 'users' ? (
            <div className="portal-card" style={{ display: 'grid', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1rem' }}>Users</h2>
                <span className="pill">{userCountLabel} loaded</span>
              </div>

              <input
                aria-label="Search users by name or email"
                type="search"
                placeholder="Search by name or email"
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
              />

              {usersStatus ? (
                <p className="muted" role="status" style={{ margin: 0 }}>{usersStatus}</p>
              ) : null}

              {usersLoading ? (
                <p className="muted" style={{ margin: 0 }}>Loading users…</p>
              ) : users.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No users found.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.35rem', maxHeight: 520, overflow: 'auto' }}>
                  {users.map((row) => (
                    <article key={row.id} className="portal-card" style={{ padding: '0.55rem', display: 'grid', gap: '0.2rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <strong>{row.name}</strong>
                        <span className="pill">{row.entity_type}</span>
                      </div>
                      <span className="muted">{row.email}</span>
                      <span className="muted">Created: {formatDateTime(row.created_at)}</span>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {tab === 'ops' ? (
            <>
              <div className="portal-card" style={{ display: 'grid', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: '1rem' }}>Organization claims</h2>
                  <button type="button" onClick={() => void loadClaimQueue()} disabled={claimQueueLoading}>
                    {claimQueueLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>
                {claimQueueStatus ? (
                  <p className="muted" role="status" style={{ margin: 0 }}>
                    {claimQueueStatus}
                  </p>
                ) : null}
                {!claimQueueLoading && claimRequests.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    No pending organization claims.
                  </p>
                ) : null}
                {claimRequests.length > 0 ? (
                  <div style={{ display: 'grid', gap: '0.6rem' }}>
                    {claimRequests.map((item) => (
                      <article key={item.id} className="portal-card" style={{ display: 'grid', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <strong>
                            <Link to={`/orgs/${encodeURIComponent(item.organization_slug)}`}>{item.organization_name}</Link>
                          </strong>
                          <span className="pill">{item.status}</span>
                        </div>
                        <p className="muted" style={{ margin: 0 }}>
                          Claimant: {item.challenger_name || item.challenger_email || item.challenger_user_id}
                        </p>
                        <p className="muted" style={{ margin: 0 }}>
                          Current owner: {item.owner_user_id || 'none'} • Claimed at: {formatDateTime(item.created_at)}
                        </p>
                        {item.explanation && <p style={{ margin: 0 }}>{item.explanation}</p>}
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => void reviewClaimRequest(item.id, 'challenger')}
                            disabled={claimActionRunningId === item.id}
                          >
                            {claimActionRunningId === item.id ? 'Working…' : 'Select this claimant'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void reviewClaimRequest(item.id, 'incumbent')}
                            disabled={claimActionRunningId === item.id}
                          >
                            {claimActionRunningId === item.id ? 'Working…' : 'Keep current owner'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>

            </>
          ) : null}
        </div>
      </div>
    </section>
  )
}
