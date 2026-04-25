import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { setSeoMeta, upsertJsonLd } from '../../utils/seo'
import { useAuth } from '../../../app/AppProviders'

const ORG_API_BASE = '/api/org'

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

type PublicOrganization = {
  id: string
  name: string
  slug: string
  description?: string | null
  source_url?: string | null
  image_url?: string | null
  tags?: string[]
  upcoming_events_count: number
  pending_claim_requests_count: number
  is_contested: boolean
  redirected_from_slug?: string | null
}

type PublicEvent = {
  id: string
  title: string
  slug: string
  description?: string | null
  starts_at?: string | null
  location?: string | null
  image_url?: string | null
}

type PublicOrgAdmin = {
  user_id: string
  user_name?: string | null
  user_email?: string | null
  role: string
}

type MyOrganization = {
  id: string
  name: string
  slug: string
  my_role?: string | null
}

function currentOrgUrl(slug: string) {
  return `${window.location.origin}/orgs/${encodeURIComponent(slug)}`
}

function summarize(text?: string | null) {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return 'Public profile for organization in the Org network.'
  return clean.length > 280 ? `${clean.slice(0, 277)}...` : clean
}

function formatDate(value?: string | null) {
  if (!value) return 'TBD'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return 'TBD'
  return dt.toLocaleString()
}

export function PublicCampaignManagerPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const { handle } = useParams()
  const [searchParams] = useSearchParams()
  const [org, setOrg] = useState<PublicOrganization | null>(null)
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [admins, setAdmins] = useState<PublicOrgAdmin[]>([])
  const [status, setStatus] = useState<string>('Loading organization…')
  const [claimStatus, setClaimStatus] = useState<string | null>(null)
  const [claimRequestMessage, setClaimRequestMessage] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [myAdminOrgs, setMyAdminOrgs] = useState<MyOrganization[]>([])
  const [myAdminOrgsStatus, setMyAdminOrgsStatus] = useState<string | null>(null)
  const [mergeSourceOrgId, setMergeSourceOrgId] = useState('')
  const [mergeStatus, setMergeStatus] = useState<string | null>(null)
  const [merging, setMerging] = useState(false)
  const [orgNameDraft, setOrgNameDraft] = useState('')
  const [savingOrgName, setSavingOrgName] = useState(false)
  const [adminView, setAdminView] = useState(true)
  const hasExistingAdmins = admins.some((admin) => admin.role === 'admin' || admin.role === 'owner')
  const canManageCurrentOrg = myAdminOrgs.some((item) => item.id === org?.id)
  const claimActionLabel = hasExistingAdmins ? 'Request Ownership Review' : 'Claim This Organization'

  useEffect(() => {
    if (!handle) return
    const canonicalUrl = currentOrgUrl(handle)
    setSeoMeta({
      title: `Organization • ${handle} • Org Portal`,
      description: 'Public organization profile in the Org network.',
      canonicalUrl,
      type: 'website',
    })
  }, [handle])

  useEffect(() => {
    if (!handle) return
    setStatus('Loading organization…')
    fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(handle)}`))
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Organization not found (${resp.status})`)
        }
        return resp.json() as Promise<PublicOrganization>
      })
      .then(async (orgData) => {
        if (orgData.redirected_from_slug && orgData.slug !== handle) {
          navigate(
            `/orgs/${encodeURIComponent(orgData.slug)}?merged_from=${encodeURIComponent(orgData.redirected_from_slug)}`,
            { replace: true },
          )
          return
        }

        const [eventData, adminData] = await Promise.all([
          fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(orgData.slug)}/events?upcoming_only=false&limit=60`)).then(
            async (resp) => {
              if (!resp.ok) return []
              return (await resp.json()) as PublicEvent[]
            },
          ),
          fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(orgData.slug)}/admins`)).then(async (resp) => {
            if (!resp.ok) return []
            return (await resp.json()) as PublicOrgAdmin[]
          }),
        ])
        setOrg(orgData)
        setOrgNameDraft(orgData.name || '')
        setEvents(Array.isArray(eventData) ? eventData : [])
        setAdmins(Array.isArray(adminData) ? adminData : [])
        setStatus('')
      })
      .catch((err) => {
        setOrg(null)
        setEvents([])
        setAdmins([])
        setStatus(err instanceof Error ? err.message : 'Organization unavailable')
      })
  }, [handle, navigate])

  const mergedFrom = (searchParams.get('merged_from') || '').trim()

  useEffect(() => {
    if (!org) return
    setSeoMeta({
      title: `${org.name} • Org Portal`,
      description: summarize(org.description),
      canonicalUrl: currentOrgUrl(org.slug),
      imageUrl: org.image_url || undefined,
      type: 'website',
    })
  }, [org])

  useEffect(() => {
    if (!token) {
      setMyAdminOrgs([])
      setMyAdminOrgsStatus('Sign in to access organization admin controls.')
      return
    }
    setMyAdminOrgsStatus('Loading admin organizations…')
    fetch(orgUrl('/api/network/orgs?mine=true&limit=300'), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Failed to load organizations (${resp.status})`)
        }
        return (await resp.json()) as MyOrganization[]
      })
      .then((rows) => {
        const admins = (Array.isArray(rows) ? rows : []).filter((row) => row.my_role === 'admin')
        setMyAdminOrgs(admins)
        setMyAdminOrgsStatus('')
      })
      .catch((err) => {
        setMyAdminOrgs([])
        setMyAdminOrgsStatus(err instanceof Error ? err.message : 'Failed to load admin organizations')
      })
  }, [token])

  const jsonLd = useMemo(() => {
    if (!org) return null
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: org.name,
        description: summarize(org.description),
        url: currentOrgUrl(org.slug),
        logo: org.image_url || undefined,
        sameAs: org.source_url ? [org.source_url] : undefined,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: org.name,
        url: currentOrgUrl(org.slug),
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Organizations',
              item: `${window.location.origin}/orgs`,
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: org.name,
              item: currentOrgUrl(org.slug),
            },
          ],
        },
      },
    ]
  }, [org])

  useEffect(() => {
    if (!jsonLd) return
    upsertJsonLd('org-profile', jsonLd)
  }, [jsonLd])

  async function claimOrganizationBySlug() {
    if (!handle || !token || !org) {
      setClaimStatus('Sign in to claim this organization.')
      return
    }
    if (canManageCurrentOrg) {
      setClaimStatus('You already manage this organization.')
      return
    }
    setClaiming(true)
    setClaimStatus(null)
    try {
      if (hasExistingAdmins) {
        const requestResp = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/claim-requests`), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: claimRequestMessage.trim() || 'Requesting ownership transfer for this organization.',
          }),
        })
        if (requestResp.ok) {
          setClaimStatus('Ownership review request submitted to admins.')
          return
        }
        const requestText = await requestResp.text().catch(() => '')
        const normalizedRequestText = requestText.toLowerCase()
        // If data is temporarily inconsistent (admins listed but org unclaimed), retry direct claim.
        if (requestResp.status !== 400 || !normalizedRequestText.includes('unclaimed')) {
          throw new Error(requestText || `Ownership review request failed (${requestResp.status})`)
        }
      }
      const resp = await fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(handle)}/claim`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.status === 409) {
        setClaimStatus('This organization is already claimed by another admin. Use Admin to request an ownership review.')
        return
      }
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Claim failed (${resp.status})`)
      }
      setClaimStatus('Organization claimed. You are now an admin.')
      const [freshOrgResp, freshAdminsResp] = await Promise.all([
        fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(handle)}`)),
        fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(handle)}/admins`)),
      ])
      if (freshOrgResp.ok) {
        setOrg((await freshOrgResp.json()) as PublicOrganization)
      }
      if (freshAdminsResp.ok) {
        setAdmins((await freshAdminsResp.json()) as PublicOrgAdmin[])
      }
    } catch (err) {
      setClaimStatus(err instanceof Error ? err.message : 'Claim failed')
    } finally {
      setClaiming(false)
    }
  }

  async function mergeOrgIntoCurrent() {
    if (!org || !token) {
      setMergeStatus('Sign in to merge organizations.')
      return
    }
    if (!mergeSourceOrgId) {
      setMergeStatus('Select a source organization to merge.')
      return
    }
    setMerging(true)
    setMergeStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/merge`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ source_organization_id: mergeSourceOrgId }),
      })
      if (!resp.ok) {
        let detail = ''
        try {
          const payload = (await resp.json()) as { detail?: string }
          detail = String(payload?.detail || '').trim()
        } catch {
          detail = (await resp.text().catch(() => '')).trim()
        }
        throw new Error(detail || `Merge failed (${resp.status})`)
      }
      setMergeStatus('Organization merged successfully.')
      setMyAdminOrgs((prev) => prev.filter((item) => item.id !== mergeSourceOrgId))
      setMergeSourceOrgId('')
    } catch (err) {
      setMergeStatus(err instanceof Error ? err.message : 'Merge failed')
    } finally {
      setMerging(false)
    }
  }

  async function saveOrganizationName() {
    if (!org || !token) {
      setMergeStatus('Sign in to update this organization.')
      return
    }
    const nextName = orgNameDraft.trim()
    if (!nextName) {
      setMergeStatus('Organization name is required.')
      return
    }
    setSavingOrgName(true)
    setMergeStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}`), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: nextName }),
      })
      if (!resp.ok) {
        let detail = ''
        try {
          const payload = (await resp.json()) as { detail?: string }
          detail = String(payload?.detail || '').trim()
        } catch {
          detail = (await resp.text().catch(() => '')).trim()
        }
        throw new Error(detail || `Update failed (${resp.status})`)
      }
      const updated = (await resp.json()) as { name?: string }
      const updatedName = String(updated?.name || nextName)
      setOrg((prev) => (prev ? { ...prev, name: updatedName } : prev))
      setMyAdminOrgs((prev) =>
        prev.map((row) => (row.id === org.id ? { ...row, name: updatedName } : row)),
      )
      setOrgNameDraft(updatedName)
      setMergeStatus('Organization name updated.')
    } catch (err) {
      setMergeStatus(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setSavingOrgName(false)
    }
  }

  if (!org) {
    return (
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>Organization</h1>
        <p className="muted">{status}</p>
        <Link to="/">Back to home</Link>
      </section>
    )
  }

  const mergeCandidates = myAdminOrgs.filter((item) => item.id !== org.id)

  return (
    <section className="panel" style={{ display: 'grid', gap: '0.85rem' }}>
      <h1 style={{ marginTop: 0 }}>{org.name}</h1>
      {mergedFrom ? (
        <p className="muted" role="status" style={{ margin: 0 }}>
          Redirected from merged organization <code>{mergedFrom}</code>.
        </p>
      ) : null}
      {org.image_url ? (
        <img
          src={org.image_url}
          alt={org.name}
          style={{ width: '100%', maxWidth: 520, borderRadius: 12, border: '1px solid var(--border)' }}
        />
      ) : null}
      {org.description ? <p style={{ margin: 0 }}>{org.description}</p> : null}
      <p className="muted" style={{ margin: 0 }}>
        Handle: <code>{org.slug}</code> • Upcoming hosted events: {org.upcoming_events_count}
      </p>
      {org.is_contested ? (
        <p className="muted" style={{ margin: 0 }}>
          Ownership status: Contested ({org.pending_claim_requests_count} pending request{org.pending_claim_requests_count === 1 ? '' : 's'}).
        </p>
      ) : null}
      {org.tags && org.tags.length ? (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {org.tags.map((tag) => (
            <span key={tag} className="pill">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {org.source_url ? (
        <p style={{ margin: 0 }}>
          <a href={org.source_url} target="_blank" rel="noreferrer">
            Source website
          </a>
        </p>
      ) : null}
      <div className="portal-card" style={{ display: 'grid', gap: '0.55rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Organization Admins</h2>
        {admins.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No admins listed yet.
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {admins.map((admin) => (
              <li key={`${admin.user_id}-${admin.role}`}>
                <strong>{admin.user_name || admin.user_email || admin.user_id}</strong>{' '}
                <span className="muted">({admin.role})</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!canManageCurrentOrg ? (
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={claimOrganizationBySlug} disabled={claiming || !token}>
            {claiming ? 'Submitting…' : claimActionLabel}
          </button>
          {!token ? <span className="muted">Sign in to continue.</span> : null}
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          You already administer this organization.
        </p>
      )}
      {claimStatus ? (
        <p className="muted" role="status" style={{ margin: 0 }}>
          {claimStatus}
        </p>
      ) : null}
      {hasExistingAdmins && !canManageCurrentOrg ? (
        <div style={{ display: 'grid', gap: '0.45rem', maxWidth: 680 }}>
          <label htmlFor="claim-request-message" className="muted">
            Ownership review message
          </label>
          <textarea
            id="claim-request-message"
            value={claimRequestMessage}
            onChange={(e) => setClaimRequestMessage(e.target.value)}
            placeholder="Explain why ownership should transfer to you."
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      ) : null}

      {canManageCurrentOrg ? (
        <div className="portal-card" style={{ display: 'grid', gap: '0.7rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Admin Controls</h2>
            <button type="button" onClick={() => setAdminView((prev) => !prev)}>
              {adminView ? 'View as User' : 'View as Admin'}
            </button>
          </div>
          {adminView ? (
            <>
              <p className="muted" style={{ margin: 0 }}>
                You are an admin of this organization.
              </p>
              {myAdminOrgsStatus ? (
                <p className="muted" style={{ margin: 0 }}>
                  {myAdminOrgsStatus}
                </p>
              ) : null}
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <label htmlFor="org-name" className="muted">
                  Organization name
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    id="org-name"
                    value={orgNameDraft}
                    onChange={(e) => setOrgNameDraft(e.target.value)}
                    placeholder="Organization name"
                    style={{ minWidth: 240, flex: '1 1 260px' }}
                  />
                  <button type="button" onClick={saveOrganizationName} disabled={savingOrgName || !orgNameDraft.trim()}>
                    {savingOrgName ? 'Saving…' : 'Save Name'}
                  </button>
                </div>
                <label htmlFor="merge-source-org" className="muted">
                  Merge one of your organizations into this one
                </label>
                <select
                  id="merge-source-org"
                  value={mergeSourceOrgId}
                  onChange={(e) => setMergeSourceOrgId(e.target.value)}
                  style={{ maxWidth: 420 }}
                >
                  <option value="">Select organization</option>
                  {mergeCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
                <div>
                  <button type="button" onClick={mergeOrgIntoCurrent} disabled={merging || !mergeSourceOrgId}>
                    {merging ? 'Merging…' : 'Merge Into This Org'}
                  </button>
                </div>
                {mergeStatus ? (
                  <p className="muted" role="status" style={{ margin: 0 }}>
                    {mergeStatus}
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              User preview mode is active. Admin controls are hidden.
            </p>
          )}
        </div>
      ) : null}

      <div className="portal-card" style={{ display: 'grid', gap: '0.6rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Hosted Events</h2>
        {events.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No hosted events listed.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {events.map((event) => (
              <article key={event.id} style={{ display: 'grid', gap: '0.25rem' }}>
                {event.image_url ? (
                  <img
                    src={event.image_url}
                    alt={event.title}
                    style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }}
                  />
                ) : null}
                <Link to={`/events/${event.slug}`} style={{ fontWeight: 700, textDecoration: 'none' }}>
                  {event.title}
                </Link>
                <span className="muted">{formatDate(event.starts_at)}{event.location ? ` • ${event.location}` : ''}</span>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
