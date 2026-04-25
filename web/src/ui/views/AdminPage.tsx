import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'

const ORG_API_BASE = '/api/org'

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

type ClaimRequestQueueItem = {
  id: string
  organization_id: string
  organization_name: string
  organization_slug: string
  organization_claimed_by_user_id?: string | null
  requested_by_user_id: string
  requested_by_email?: string | null
  requested_by_name?: string | null
  message?: string | null
  status: 'pending' | 'approved' | 'rejected' | string
  reviewed_by_user_id?: string | null
  reviewed_at?: string | null
  created_at: string
}

function formatDateTime(value?: string | null) {
  if (!value) return 'N/A'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

export function AdminPage() {
  const { token } = useAuth()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [claimRequests, setClaimRequests] = useState<ClaimRequestQueueItem[]>([])
  const [claimQueueStatus, setClaimQueueStatus] = useState<string | null>(null)
  const [claimQueueLoading, setClaimQueueLoading] = useState(false)
  const [claimActionRunningId, setClaimActionRunningId] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Org Portal • Admin'
  }, [])

  useEffect(() => {
    if (!token) {
      setIsAdmin(false)
      return
    }
    fetch(orgUrl('/admin/me'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((resp) => (resp.ok ? resp.json() : { is_admin: false }))
      .then((data) => setIsAdmin(Boolean(data.is_admin)))
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
      const resp = await fetch(orgUrl('/api/network/claim-requests?status=pending&limit=500'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Failed to load contested ownerships (${resp.status})`)
      }
      const rows = (await resp.json()) as ClaimRequestQueueItem[]
      setClaimRequests(Array.isArray(rows) ? rows : [])
    } catch (err) {
      setClaimRequests([])
      setClaimQueueStatus(err instanceof Error ? err.message : 'Failed to load contested ownerships.')
    } finally {
      setClaimQueueLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin && token) {
      loadClaimQueue()
    } else if (isAdmin === false) {
      setClaimRequests([])
      setClaimQueueStatus(null)
    }
  }, [isAdmin, token])

  async function reviewClaimRequest(claimRequestId: string, action: 'approve' | 'reject') {
    if (!token) {
      setClaimQueueStatus('Login required.')
      return
    }
    setClaimActionRunningId(claimRequestId)
    setClaimQueueStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/claim-requests/${encodeURIComponent(claimRequestId)}/${action}`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `${action} failed (${resp.status})`)
      }
      setClaimQueueStatus(action === 'approve' ? 'Ownership contest approved.' : 'Ownership contest rejected.')
      await loadClaimQueue()
    } catch (err) {
      setClaimQueueStatus(err instanceof Error ? err.message : `${action} failed.`)
    } finally {
      setClaimActionRunningId(null)
    }
  }

  return (
    <section className="panel">
      <h1 style={{ marginTop: 0 }}>Admin</h1>
      {isAdmin === false ? (
        <p className="muted">You do not have access to this page.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Admin actions affect all petitions. Proceed carefully.
          </p>
          <div className="portal-card" style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1rem' }}>Contested Ownerships</h2>
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
                No pending ownership contests.
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
                      Requested by: {item.requested_by_name || item.requested_by_email || item.requested_by_user_id}
                    </p>
                    <p className="muted" style={{ margin: 0 }}>
                      Current owner: {item.organization_claimed_by_user_id || 'none'} • Requested at: {formatDateTime(item.created_at)}
                    </p>
                    {item.message ? <p style={{ margin: 0 }}>{item.message}</p> : null}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => void reviewClaimRequest(item.id, 'approve')}
                        disabled={claimActionRunningId === item.id}
                      >
                        {claimActionRunningId === item.id ? 'Working…' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void reviewClaimRequest(item.id, 'reject')}
                        disabled={claimActionRunningId === item.id}
                      >
                        {claimActionRunningId === item.id ? 'Working…' : 'Reject'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={async () => {
              if (!token) {
                setStatus('Login required.')
                return
              }
              setIsRunning(true)
              setStatus(null)
              try {
                const resp = await fetch('/api/ballot/admin/dedupe-signatures', {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}` },
                })
                if (!resp.ok) {
                  const text = await resp.text().catch(() => '')
                  throw new Error(text || `Dedupe failed (${resp.status})`)
                }
                const data = await resp.json()
                setStatus(`Deduped signatures. Kept: ${data.kept ?? 0}, removed: ${data.removed ?? 0}.`)
              } catch (err) {
                setStatus(err instanceof Error ? err.message : 'Dedupe failed.')
              } finally {
                setIsRunning(false)
              }
            }}
            disabled={isRunning}
            style={{ background: '#b42318', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1rem' }}
          >
            {isRunning ? 'Deduplicating…' : 'Deduplicate signatures'}
          </button>
          {status ? (
            <p className="muted" role="status" style={{ marginBottom: 0 }}>
              {status}
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}
