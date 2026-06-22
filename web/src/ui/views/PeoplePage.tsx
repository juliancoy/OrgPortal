import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { OrgImage } from '../components/media/OrgImage'
import { setSeoMeta } from '../utils/seo'

const ORG_API_BASE = '/api/org'

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

type NetworkUser = {
  user_id: string
  user_name: string
  created_at?: string | null
  updated_at?: string | null
  slug?: string | null
  enabled?: boolean
  contact_slug?: string | null
  contact_enabled?: boolean
  headline?: string | null
  photo_url?: string | null
  connection_status?: 'self' | 'none' | 'pending_sent' | 'pending_received' | 'connected' | 'declined'
}

type PublicOrganization = {
  id: string
  name: string
  slug: string
  description?: string | null
  image_url?: string | null
  tags?: string[]
  membership_count?: number
  upcoming_events_count?: number
  favor_count?: number
  disfavor_count?: number
}

export function PeoplePage() {
  const { token, user } = useAuth()
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<NetworkUser[]>([])
  const [organizations, setOrganizations] = useState<PublicOrganization[]>([])
  const [status, setStatus] = useState('Loading directory...')
  const [actionStatus, setActionStatus] = useState('')

  useEffect(() => {
    setSeoMeta({
      title: 'People & Organizations • Org Portal',
      description: 'Browse public people and organization profiles across Org Portal.',
      canonicalUrl: `${window.location.origin}/people`,
      type: 'website',
    })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        setStatus('Loading directory...')
        const params = new URLSearchParams({
          limit: '500',
          sort: 'recent',
        })
        if (query.trim()) params.set('q', query.trim())
        const orgParams = new URLSearchParams(params)
        orgParams.set('sort', 'popular')

        const userPath = token ? '/api/network/users' : '/api/network/users/public'
        const userOptions: RequestInit = token
          ? {
              headers: { Authorization: `Bearer ${token}` },
              signal: controller.signal,
            }
          : { signal: controller.signal }

        const [userResponse, organizationResponse] = await Promise.all([
          fetch(orgUrl(`${userPath}?${params.toString()}`), userOptions),
          fetch(orgUrl(`/api/network/orgs/public?${orgParams.toString()}`), {
            signal: controller.signal,
          }),
        ])

        if (!userResponse.ok) {
          const text = await userResponse.text().catch(() => '')
          throw new Error(text || `Failed to load people (${userResponse.status})`)
        }
        if (!organizationResponse.ok) {
          const text = await organizationResponse.text().catch(() => '')
          throw new Error(text || `Failed to load organizations (${organizationResponse.status})`)
        }

        const [userRows, organizationRows] = await Promise.all([
          userResponse.json() as Promise<NetworkUser[]>,
          organizationResponse.json() as Promise<PublicOrganization[]>,
        ])
        setUsers(Array.isArray(userRows) ? userRows : [])
        setOrganizations(Array.isArray(organizationRows) ? organizationRows : [])
        setStatus('')
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setUsers([])
        setOrganizations([])
        setStatus(error instanceof Error ? error.message : 'Unable to load directory')
      }
    }, 180)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [token, query])

  const totalLabel = useMemo(() => {
    const peopleLabel = `${users.length.toLocaleString()} ${users.length === 1 ? 'person' : 'people'}`
    const orgLabel = `${organizations.length.toLocaleString()} ${
      organizations.length === 1 ? 'organization' : 'organizations'
    }`
    return `${peopleLabel}, ${orgLabel}`
  }, [organizations.length, users.length])

  async function requestConnection(person: NetworkUser) {
    if (!token) {
      setActionStatus('Sign in to request a connection.')
      return
    }
    setActionStatus('')
    try {
      const response = await fetch(orgUrl('/api/network/connections/request'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ target_user_id: person.user_id }),
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(text || `Connection request failed (${response.status})`)
      }
      setUsers((prev) =>
        prev.map((item) => (item.user_id === person.user_id ? { ...item, connection_status: 'pending_sent' } : item)),
      )
      setActionStatus(`Connection request sent to ${person.user_name}.`)
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : 'Connection request failed')
    }
  }

  return (
    <section className="panel" style={{ display: 'grid', gap: '1rem' }}>
      <h1 style={{ marginTop: 0 }}>People</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Public people and organization directory. {status ? status : totalLabel}
      </p>

      <label style={{ display: 'grid', gap: '0.35rem', maxWidth: 420 }}>
        <span className="muted">Filter directory</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or organization"
          aria-label="Search people and organizations by name"
        />
      </label>

      {!status && users.length === 0 && organizations.length === 0 ? <p className="muted">No profiles found.</p> : null}
      {actionStatus ? (
        <p className="muted" style={{ margin: 0 }}>
          {actionStatus}
        </p>
      ) : null}

      <div style={{ display: 'grid', gap: '1.25rem' }}>
        {users.length > 0 ? (
          <section aria-labelledby="people-directory-heading" style={{ display: 'grid', gap: '0.9rem' }}>
            <h2 id="people-directory-heading" style={{ margin: 0, fontSize: '1.05rem' }}>
              People
            </h2>
            {users.map((person) => {
              const isSelf = Boolean(user?.id && user.id === person.user_id)
              const contactSlug = person.contact_slug || person.slug
              const contactEnabled = person.contact_enabled ?? person.enabled ?? true
              const profilePath = contactSlug && (contactEnabled || isSelf)
                ? `/users/${encodeURIComponent(contactSlug)}`
                : isSelf
                  ? '/profile'
                  : null
              const dateLabel = person.created_at || person.updated_at

              return (
                <article
                  key={person.user_id}
                  className="portal-card"
                  style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start', flexWrap: 'wrap' }}
                >
                  {person.photo_url ? (
                    <img
                      src={person.photo_url}
                      alt={person.user_name}
                      style={{
                        width: 76,
                        height: 76,
                        objectFit: 'cover',
                        borderRadius: 12,
                        border: '1px solid var(--border)',
                        flex: '0 0 auto',
                      }}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 76,
                        height: 76,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 12,
                        border: '1px solid var(--border)',
                        background: 'rgba(0,42,97,0.25)',
                        fontWeight: 700,
                        fontSize: '1.4rem',
                        flex: '0 0 auto',
                      }}
                    >
                      {person.user_name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div style={{ display: 'grid', gap: '0.42rem', minWidth: 220, flex: '1 1 360px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
                      {profilePath ? (
                        <Link to={profilePath} style={{ textDecoration: 'none' }}>
                          {person.user_name}
                        </Link>
                      ) : (
                        person.user_name
                      )}
                    </h3>
                    {person.headline ? <p style={{ margin: 0 }}>{person.headline}</p> : null}
                    {dateLabel ? (
                      <p className="muted" style={{ margin: 0 }}>
                        Updated {new Date(dateLabel).toLocaleDateString()}
                      </p>
                    ) : null}
                    {profilePath ? (
                      <Link
                        to={profilePath}
                        className="btn-primary"
                        style={{ textDecoration: 'none', width: 'fit-content' }}
                      >
                        View public info
                      </Link>
                    ) : (
                      <span className="muted">No public profile yet</span>
                    )}
                    {!token ? (
                      <span className="muted">Sign in to connect</span>
                    ) : person.connection_status === 'self' ? null : person.connection_status === 'connected' ? (
                      <span className="muted">Connected</span>
                    ) : person.connection_status === 'pending_sent' ? (
                      <span className="muted">Connection pending</span>
                    ) : person.connection_status === 'pending_received' ? (
                      <span className="muted">They requested to connect. Use notifications to respond.</span>
                    ) : (
                      <button type="button" onClick={() => requestConnection(person)} style={{ width: 'fit-content' }}>
                        Connect
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </section>
        ) : null}

        {organizations.length > 0 ? (
          <section aria-labelledby="organizations-directory-heading" style={{ display: 'grid', gap: '0.9rem' }}>
            <h2 id="organizations-directory-heading" style={{ margin: 0, fontSize: '1.05rem' }}>
              Organizations
            </h2>
            {organizations.map((org) => (
              <article
                key={org.id}
                className="portal-card"
                style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start', flexWrap: 'wrap' }}
              >
                <OrgImage
                  src={org.image_url}
                  alt={org.name}
                  style={{
                    width: 76,
                    height: 76,
                    objectFit: 'cover',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    flex: '0 0 auto',
                  }}
                />
                <div style={{ display: 'grid', gap: '0.42rem', minWidth: 220, flex: '1 1 360px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
                    <Link to={`/orgs/${encodeURIComponent(org.slug)}`} style={{ textDecoration: 'none' }}>
                      {org.name}
                    </Link>
                  </h3>
                  {org.description ? <p style={{ margin: 0, overflowWrap: 'anywhere' }}>{org.description}</p> : null}
                  <p className="muted" style={{ margin: 0 }}>
                    Organization
                    {typeof org.membership_count === 'number' ? ` • Members: ${org.membership_count}` : ''}
                    {typeof org.upcoming_events_count === 'number'
                      ? ` • Upcoming events: ${org.upcoming_events_count}`
                      : ''}
                    {typeof org.favor_count === 'number' || typeof org.disfavor_count === 'number'
                      ? ` • Favor ${org.favor_count || 0} / Disfavor ${org.disfavor_count || 0}`
                      : ''}
                  </p>
                  {org.tags?.length ? (
                    <p className="muted" style={{ margin: 0 }}>
                      {org.tags.slice(0, 6).join(' • ')}
                    </p>
                  ) : null}
                  <Link
                    to={`/orgs/${encodeURIComponent(org.slug)}`}
                    className="btn-primary"
                    style={{ textDecoration: 'none', width: 'fit-content' }}
                  >
                    View public page
                  </Link>
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </section>
  )
}
