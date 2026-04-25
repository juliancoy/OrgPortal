import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'

const ORG_API_BASE = '/api/org'

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

type Org = {
  id: string
  name: string
  slug: string
  description?: string | null
  source_url?: string | null
  source_urls?: string[]
  image_url?: string | null
  tags?: string[]
  seeded_from_events: boolean
  claimed_by_user_id?: string | null
  membership_count: number
  my_role?: string | null
}

type OrgMember = {
  user_id: string
  user_email?: string | null
  user_name?: string | null
  role: 'member' | 'admin'
  created_at: string
}

export function CampaignProfilePage() {
  const { token } = useAuth()
  const [orgs, setOrgs] = useState<Org[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [selectedOrgId, setSelectedOrgId] = useState<string>('')
  const [members, setMembers] = useState<OrgMember[]>([])
  const [memberUserId, setMemberUserId] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberName, setMemberName] = useState('')
  const [memberRole, setMemberRole] = useState<'member' | 'admin'>('member')
  const [mergeSourceByTarget, setMergeSourceByTarget] = useState<Record<string, string>>({})
  const [orgNameById, setOrgNameById] = useState<Record<string, string>>({})

  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgUrl, setNewOrgUrl] = useState('')
  const [newOrgImage, setNewOrgImage] = useState('')
  const [newOrgTags, setNewOrgTags] = useState('')
  const [newOrgDescription, setNewOrgDescription] = useState('')
  const [claimOnCreate, setClaimOnCreate] = useState(true)

  useEffect(() => {
    document.title = 'Org Portal • Organization network'
  }, [])

  async function loadOrgs() {
    if (!token) return
    setLoading(true)
    setStatus(null)
    try {
      const params = new URLSearchParams({ limit: '300' })
      if (q.trim()) params.set('q', q.trim())
      const resp = await fetch(orgUrl(`/api/network/orgs?${params.toString()}`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Failed to load organizations (${resp.status})`)
      }
      const data = await resp.json()
      const rows = Array.isArray(data) ? data : []
      setOrgs(rows)
      setOrgNameById(
        Object.fromEntries(
          rows.map((org) => [org.id, org.name]),
        ) as Record<string, string>,
      )
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load organizations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrgs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function claimOrg(orgId: string) {
    if (!token) return
    setStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/orgs/${orgId}/claim`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.status === 409) {
        const requestResp = await fetch(orgUrl(`/api/network/orgs/${orgId}/claim-requests`), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: 'Requesting ownership transfer for this organization.',
          }),
        })
        if (!requestResp.ok) {
          const text = await requestResp.text().catch(() => '')
          throw new Error(text || `Claim request failed (${requestResp.status})`)
        }
        setStatus('Organization is already claimed. Claim request submitted to admins.')
        return
      }
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Claim failed (${resp.status})`)
      }
      setStatus('Organization claimed. You are now an organization admin.')
      await loadOrgs()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Claim failed')
    }
  }

  async function createOrg() {
    if (!token) return
    if (!newOrgName.trim()) {
      setStatus('Organization name is required.')
      return
    }
    setStatus(null)
    try {
      const resp = await fetch(orgUrl('/api/network/orgs'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newOrgName.trim(),
          source_url: newOrgUrl.trim() || null,
          image_url: newOrgImage.trim() || null,
          description: newOrgDescription.trim() || null,
          claim_on_create: claimOnCreate,
          tags: newOrgTags
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Create failed (${resp.status})`)
      }
      setNewOrgName('')
      setNewOrgUrl('')
      setNewOrgImage('')
      setNewOrgDescription('')
      setNewOrgTags('')
      setClaimOnCreate(true)
      setStatus('Organization created.')
      await loadOrgs()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Create failed')
    }
  }

  async function unclaimOrg(orgId: string) {
    if (!token) return
    setStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/orgs/${orgId}/unclaim`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Unclaim failed (${resp.status})`)
      }
      setStatus('Organization unclaimed.')
      await loadOrgs()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Unclaim failed')
    }
  }

  async function mergeOrg(targetOrgId: string) {
    if (!token) return
    const sourceOrgId = mergeSourceByTarget[targetOrgId]
    if (!sourceOrgId) {
      setStatus('Choose a source organization to merge.')
      return
    }
    if (sourceOrgId === targetOrgId) {
      setStatus('Source and target organizations must be different.')
      return
    }
    setStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/orgs/${targetOrgId}/merge`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ source_organization_id: sourceOrgId }),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Merge failed (${resp.status})`)
      }
      setStatus('Organizations merged successfully.')
      setMergeSourceByTarget((prev) => {
        const next = { ...prev }
        delete next[targetOrgId]
        return next
      })
      if (selectedOrgId === sourceOrgId) {
        setSelectedOrgId('')
        setMembers([])
      }
      await loadOrgs()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Merge failed')
    }
  }

  async function renameOrg(orgId: string) {
    if (!token) return
    const nextName = (orgNameById[orgId] || '').trim()
    if (!nextName) {
      setStatus('Organization name is required.')
      return
    }
    setStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/orgs/${orgId}`), {
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
        throw new Error(detail || `Rename failed (${resp.status})`)
      }
      setStatus('Organization updated.')
      await loadOrgs()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Rename failed')
    }
  }

  async function loadMembers(orgId: string) {
    if (!token) return
    setSelectedOrgId(orgId)
    setStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/orgs/${orgId}/members`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Failed to load members (${resp.status})`)
      }
      const data = await resp.json()
      setMembers(Array.isArray(data) ? data : [])
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load members')
    }
  }

  async function upsertMember() {
    if (!token || !selectedOrgId) return
    if (!memberUserId.trim()) {
      setStatus('Member user ID is required.')
      return
    }
    setStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/orgs/${selectedOrgId}/members`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: memberUserId.trim(),
          user_email: memberEmail.trim() || null,
          user_name: memberName.trim() || null,
          role: memberRole,
        }),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Failed to add member (${resp.status})`)
      }
      setMemberUserId('')
      setMemberEmail('')
      setMemberName('')
      setMemberRole('member')
      await loadMembers(selectedOrgId)
      setStatus('Member updated.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to update member')
    }
  }

  const selectedOrg = useMemo(() => orgs.find((org) => org.id === selectedOrgId) ?? null, [orgs, selectedOrgId])

  return (
    <section className="panel" style={{ display: 'grid', gap: '1rem' }}>
      <h1 style={{ marginTop: 0 }}>Organization Network</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Create or claim organizations seeded from `baltimore/event_sources.py`, then manage members/admins and merge duplicates.
      </p>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <Link to="/contact-settings">Manage My Contact Page</Link>
        <Link to="/orgs/initiatives">My Initiatives</Link>
        <Link to="/orgs/events">Events</Link>
      </div>

      <div className="portal-card" style={{ display: 'grid', gap: '0.6rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Find Organizations</h2>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or slug"
            style={{ flex: '1 1 260px' }}
          />
          <button type="button" onClick={loadOrgs} disabled={!token || loading}>
            {loading ? 'Loading…' : 'Search'}
          </button>
        </div>
      </div>

      <div className="portal-card" style={{ display: 'grid', gap: '0.6rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Create Organization</h2>
        <input value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="Organization name" />
        <input value={newOrgUrl} onChange={(e) => setNewOrgUrl(e.target.value)} placeholder="Source URL (optional)" />
        <input value={newOrgImage} onChange={(e) => setNewOrgImage(e.target.value)} placeholder="Image URL (optional)" />
        <input value={newOrgTags} onChange={(e) => setNewOrgTags(e.target.value)} placeholder="Tags, comma separated" />
        <textarea value={newOrgDescription} onChange={(e) => setNewOrgDescription(e.target.value)} rows={3} placeholder="Description" />
        <label style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="checkbox" checked={claimOnCreate} onChange={(e) => setClaimOnCreate(e.target.checked)} />
          Claim ownership on create
        </label>
        <div>
          <button type="button" onClick={createOrg} disabled={!token}>Create</button>
        </div>
      </div>

      {status ? <p className="muted">{status}</p> : null}

      <div style={{ display: 'grid', gap: '0.6rem' }}>
        {orgs.map((org) => {
          const canManage = org.my_role === 'admin'
          const sourceOptions = orgs.filter((candidate) => candidate.id !== org.id)
          const sourceUrls = Array.isArray(org.source_urls) && org.source_urls.length > 0
            ? org.source_urls
            : (org.source_url ? [org.source_url] : [])
          return (
            <article key={org.id} className="portal-card" style={{ display: 'grid', gap: '0.4rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'start' }}>
                <div>
                  <strong>{org.name}</strong> <span className="muted">(@{org.slug})</span>
                  {org.description ? <div className="muted">{org.description}</div> : null}
                  <div className="muted" style={{ fontSize: '0.8rem' }}>
                    {sourceUrls.length > 0 ? sourceUrls[0] : 'User-created'} • Members: {org.membership_count} • {org.seeded_from_events ? 'Seeded' : 'Custom'}
                  </div>
                  {sourceUrls.length > 1 ? (
                    <div className="muted" style={{ fontSize: '0.8rem' }}>
                      Sources: {sourceUrls.join(' • ')}
                    </div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {!org.claimed_by_user_id ? (
                    <button type="button" onClick={() => claimOrg(org.id)} disabled={!token}>Claim</button>
                  ) : null}
                  {org.claimed_by_user_id && canManage ? (
                    <button type="button" onClick={() => unclaimOrg(org.id)} disabled={!token}>Unclaim</button>
                  ) : null}
                  {canManage ? (
                    <button type="button" onClick={() => loadMembers(org.id)}>Manage Members</button>
                  ) : null}
                </div>
              </div>
              {canManage ? (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    value={orgNameById[org.id] ?? org.name}
                    onChange={(e) =>
                      setOrgNameById((prev) => ({
                        ...prev,
                        [org.id]: e.target.value,
                      }))
                    }
                    placeholder="Organization name"
                    style={{ minWidth: 220 }}
                  />
                  <button
                    type="button"
                    onClick={() => renameOrg(org.id)}
                    disabled={!token}
                  >
                    Save Name
                  </button>
                  <select
                    value={mergeSourceByTarget[org.id] ?? ''}
                    onChange={(e) =>
                      setMergeSourceByTarget((prev) => ({
                        ...prev,
                        [org.id]: e.target.value,
                      }))
                    }
                    style={{ minWidth: 220 }}
                  >
                    <option value="">Select source org to merge into {org.name}</option>
                    {sourceOptions.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name} (@{candidate.slug})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => mergeOrg(org.id)}
                    disabled={!token || !mergeSourceByTarget[org.id]}
                  >
                    Merge Into This Org
                  </button>
                </div>
              ) : null}
            </article>
          )
        })}
      </div>

      {selectedOrg ? (
        <section className="portal-card" style={{ display: 'grid', gap: '0.6rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Members: {selectedOrg.name}</h2>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <input value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)} placeholder="User ID (required)" />
            <input value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="Name (optional)" />
            <input value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="Email (optional)" />
            <select value={memberRole} onChange={(e) => setMemberRole(e.target.value as 'member' | 'admin')}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
            <div>
              <button type="button" onClick={upsertMember}>Save Member</button>
            </div>
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {members.map((member) => (
              <li key={member.user_id}>
                <strong>{member.user_name || member.user_email || member.user_id}</strong> <span className="muted">({member.role})</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  )
}
