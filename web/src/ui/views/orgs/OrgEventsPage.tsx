import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'

const ORG_API_BASE = '/api/org'

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

type HostType = 'unclaimed' | 'individual' | 'org'

type NetworkEvent = {
  id: string
  title: string
  slug: string
  description?: string | null
  starts_at?: string | null
  ends_at?: string | null
  location?: string | null
  source_url?: string | null
  image_url?: string | null
  tags?: string[]
  host_type: HostType
  host_user_id?: string | null
  host_org_id?: string | null
  host_org_name?: string | null
  claimed_by_user_id?: string | null
  is_unclaimed: boolean
  my_host_role?: string | null
}

type Org = {
  id: string
  name: string
  slug: string
  my_role?: string | null
}

function toIsoDateTime(value: string): string | null {
  const raw = value.trim()
  if (!raw) return null
  const dt = new Date(raw)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
}

export function OrgEventsPage() {
  const { token } = useAuth()
  const [events, setEvents] = useState<NetworkEvent[]>([])
  const [orgs, setOrgs] = useState<Org[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [onlyUnclaimed, setOnlyUnclaimed] = useState(false)
  const [hostFilter, setHostFilter] = useState<'all' | HostType>('all')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [hostType, setHostType] = useState<HostType>('unclaimed')
  const [hostOrgId, setHostOrgId] = useState('')
  const [claimOnCreate, setClaimOnCreate] = useState(false)
  const [claimHostTypeByEvent, setClaimHostTypeByEvent] = useState<Record<string, Exclude<HostType, 'unclaimed'>>>({})
  const [claimHostOrgIdByEvent, setClaimHostOrgIdByEvent] = useState<Record<string, string>>({})

  useEffect(() => {
    document.title = 'Org Portal • Org events'
  }, [])

  const adminOrgs = useMemo(() => orgs.filter((org) => org.my_role === 'admin'), [orgs])

  const loadOrgs = useCallback(async () => {
    if (!token) return
    try {
      const resp = await fetch(orgUrl('/api/network/orgs?mine=true&limit=300'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Failed to load organizations (${resp.status})`)
      }
      const data = await resp.json()
      setOrgs(Array.isArray(data) ? (data as Org[]) : [])
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load organizations')
    }
  }, [token])

  const loadEvents = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setStatus(null)
    try {
      const params = new URLSearchParams({ limit: '300' })
      if (search.trim()) params.set('q', search.trim())
      if (onlyMine) params.set('mine', 'true')
      if (onlyUnclaimed) params.set('only_unclaimed', 'true')
      if (hostFilter !== 'all') params.set('host_type', hostFilter)
      const resp = await fetch(orgUrl(`/api/network/events?${params.toString()}`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Failed to load events (${resp.status})`)
      }
      const data = await resp.json()
      setEvents(Array.isArray(data) ? (data as NetworkEvent[]) : [])
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load events')
    } finally {
      setLoading(false)
    }
  }, [hostFilter, onlyMine, onlyUnclaimed, search, token])

  useEffect(() => {
    loadOrgs()
    loadEvents()
  }, [loadOrgs, loadEvents])

  async function createEvent() {
    if (!token) return
    if (!title.trim()) {
      setStatus('Event title is required.')
      return
    }
    if (hostType === 'org' && !hostOrgId) {
      setStatus('Choose a host organization for org-hosted events.')
      return
    }
    setStatus(null)
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        starts_at: toIsoDateTime(startsAt),
        ends_at: toIsoDateTime(endsAt),
        source_url: sourceUrl.trim() || null,
        image_url: imageUrl.trim() || null,
        tags: tagsText
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        host_type: hostType,
        claim_on_create: claimOnCreate,
      }
      if (hostType === 'org') {
        payload.host_org_id = hostOrgId
      }
      const resp = await fetch(orgUrl('/api/network/events'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Create failed (${resp.status})`)
      }
      setTitle('')
      setDescription('')
      setLocation('')
      setStartsAt('')
      setEndsAt('')
      setSourceUrl('')
      setImageUrl('')
      setTagsText('')
      setHostType('unclaimed')
      setHostOrgId('')
      setClaimOnCreate(false)
      setStatus('Event created.')
      await loadEvents()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Create failed')
    }
  }

  async function claimEvent(eventId: string) {
    if (!token) return
    const claimHostType = claimHostTypeByEvent[eventId] ?? 'individual'
    const claimPayload: Record<string, unknown> = {
      host_type: claimHostType,
    }
    if (claimHostType === 'org') {
      const selectedOrgId = claimHostOrgIdByEvent[eventId]
      if (!selectedOrgId) {
        setStatus('Select an organization before claiming as org host.')
        return
      }
      claimPayload.host_org_id = selectedOrgId
    }

    setStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/events/${eventId}/claim`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(claimPayload),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Claim failed (${resp.status})`)
      }
      setStatus('Event claimed.')
      await loadEvents()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Claim failed')
    }
  }

  async function unclaimEvent(eventId: string) {
    if (!token) return
    setStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/events/${eventId}/unclaim`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Unclaim failed (${resp.status})`)
      }
      setStatus('Event unclaimed.')
      await loadEvents()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Unclaim failed')
    }
  }

  return (
    <section className="panel" style={{ display: 'grid', gap: '1rem' }}>
      <h1 style={{ marginTop: 0 }}>Organization Events</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Events can be hosted by individuals, organizations, or remain unclaimed. Ownership claim and host binding are separate but compatible.
      </p>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <Link to="/orgs/profile">Organization Network</Link>
        <Link to="/orgs/initiatives">My Initiatives</Link>
      </div>

      <div className="portal-card" style={{ display: 'grid', gap: '0.6rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Find Events</h2>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title, slug, or location" />
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            Mine
          </label>
          <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
            <input type="checkbox" checked={onlyUnclaimed} onChange={(e) => setOnlyUnclaimed(e.target.checked)} />
            Unclaimed only
          </label>
          <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
            Host type
            <select value={hostFilter} onChange={(e) => setHostFilter(e.target.value as 'all' | HostType)}>
              <option value="all">all</option>
              <option value="unclaimed">unclaimed</option>
              <option value="individual">individual</option>
              <option value="org">org</option>
            </select>
          </label>
          <button type="button" onClick={loadEvents} disabled={!token || loading}>
            {loading ? 'Loading…' : 'Search'}
          </button>
        </div>
      </div>

      <div className="portal-card" style={{ display: 'grid', gap: '0.6rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Create Event</h2>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Description" />
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" />
        <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: '1fr 1fr' }}>
          <label style={{ display: 'grid', gap: '0.3rem' }}>
            <span className="muted">Starts at</span>
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: '0.3rem' }}>
            <span className="muted">Ends at</span>
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
        </div>
        <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="Source URL (optional)" />
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Image URL (optional)" />
        <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Tags, comma separated" />
        <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
          Host type
          <select value={hostType} onChange={(e) => setHostType(e.target.value as HostType)}>
            <option value="unclaimed">unclaimed</option>
            <option value="individual">individual</option>
            <option value="org">org</option>
          </select>
        </label>
        {hostType === 'org' ? (
          <select value={hostOrgId} onChange={(e) => setHostOrgId(e.target.value)}>
            <option value="">Select org host</option>
            {adminOrgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} (@{org.slug})
              </option>
            ))}
          </select>
        ) : null}
        <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
          <input type="checkbox" checked={claimOnCreate} onChange={(e) => setClaimOnCreate(e.target.checked)} />
          Claim ownership on create
        </label>
        <div>
          <button type="button" onClick={createEvent} disabled={!token}>Create Event</button>
        </div>
      </div>

      {status ? <p className="muted">{status}</p> : null}

      <div style={{ display: 'grid', gap: '0.6rem' }}>
        {events.map((event) => {
          const selectedClaimHostType = claimHostTypeByEvent[event.id] ?? 'individual'
          const selectedClaimHostOrgId = claimHostOrgIdByEvent[event.id] ?? ''
          const canUnclaim = event.my_host_role === 'owner'
          return (
            <article key={event.id} className="portal-card" style={{ display: 'grid', gap: '0.5rem' }}>
              <div>
                <strong>{event.title}</strong> <span className="muted">(@{event.slug})</span>
              </div>
              {event.description ? <div className="muted">{event.description}</div> : null}
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                Host: {event.host_type}
                {event.host_type === 'org' && event.host_org_name ? ` (${event.host_org_name})` : ''}
                {' • '}Claimed: {event.claimed_by_user_id ? 'yes' : 'no'}
                {event.location ? ` • ${event.location}` : ''}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  value={selectedClaimHostType}
                  onChange={(e) =>
                    setClaimHostTypeByEvent((prev) => ({
                      ...prev,
                      [event.id]: e.target.value as Exclude<HostType, 'unclaimed'>,
                    }))
                  }
                >
                  <option value="individual">individual host</option>
                  <option value="org">org host</option>
                </select>
                {selectedClaimHostType === 'org' ? (
                  <select
                    value={selectedClaimHostOrgId}
                    onChange={(e) =>
                      setClaimHostOrgIdByEvent((prev) => ({
                        ...prev,
                        [event.id]: e.target.value,
                      }))
                    }
                  >
                    <option value="">Select org host</option>
                    {adminOrgs.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name} (@{org.slug})
                      </option>
                    ))}
                  </select>
                ) : null}
                <button type="button" onClick={() => claimEvent(event.id)} disabled={!token}>
                  {event.claimed_by_user_id ? 'Re-claim / update host' : 'Claim'}
                </button>
                {canUnclaim ? (
                  <button type="button" onClick={() => unclaimEvent(event.id)} disabled={!token}>
                    Unclaim
                  </button>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
