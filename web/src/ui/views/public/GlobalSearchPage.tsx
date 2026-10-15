import { GlobalSearchForm } from '../../components/GlobalSearchForm'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { setSeoMeta } from '../../utils/seo'
import { useAuth } from '../../../app/AppProviders'
import { pidpAppLoginUrl } from '../../../config/pidp'
import { OrgImage } from '../../components/media/OrgImage'
import { getActivePortalProfileConfig } from '../../../config/portalFeatures'

const ORG_API_BASE = '/api/org'
const MIN_QUERY_LEN = 2
const CACHE_MAX = 20

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

type SearchOrganization = {
  id: string
  name: string
  slug: string
  description?: string | null
  image_url?: string | null
  membership_count?: number
  upcoming_events_count?: number
}

type SearchEvent = {
  id: string
  title: string
  slug: string
  description?: string | null
  starts_at?: string | null
  location?: string | null
  image_url?: string | null
}

type SearchUser = {
  user_id: string
  user_name: string
  slug: string
  headline?: string | null
  bio?: string | null
  photo_url?: string | null
  upcoming_events_count?: number
}

type SearchCacheEntry = {
  orgs: SearchOrganization[]
  events: SearchEvent[]
  users: SearchUser[]
}

function formatEventDate(value?: string | null): string {
  if (!value) return 'Date TBD'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return 'Date TBD'
  return dt.toLocaleString()
}

export function GlobalSearchPage() {
  const portalProfile = getActivePortalProfileConfig()
  const { token, user } = useAuth()
  const [searchParams] = useSearchParams()
  const q = (searchParams.get('q') || '').trim()
  const requestedScope = (searchParams.get('scope') || 'all').trim().toLowerCase()
  const scope = requestedScope === 'orgs' || requestedScope === 'events' || requestedScope === 'people' ? requestedScope : 'all'

  const [status, setStatus] = useState('')
  const [orgs, setOrgs] = useState<SearchOrganization[]>([])
  const [events, setEvents] = useState<SearchEvent[]>([])
  const [users, setUsers] = useState<SearchUser[]>([])
  const cacheRef = useRef<Map<string, SearchCacheEntry>>(new Map())

  useEffect(() => {
    setSeoMeta({
      title: `${q ? `Search: ${q}` : 'Search'} • ${portalProfile.portalTitle}`,
      description: q
        ? `Search organizations, events, and people for "${q}".`
        : 'Search organizations, events, and people in Org Portal.',
      canonicalUrl: `${window.location.origin}/search${
        q ? `?q=${encodeURIComponent(q)}${scope !== 'all' ? `&scope=${encodeURIComponent(scope)}` : ''}` : ''
      }`,
      type: 'website',
    })
  }, [q, scope, portalProfile.portalTitle])

  useEffect(() => { cacheRef.current.clear() }, [token, user?.id])

  useEffect(() => {
    if (q.length < MIN_QUERY_LEN) {
      setStatus('Enter at least 2 characters to search.')
      setOrgs([])
      setEvents([])
      setUsers([])
      return
    }

    const cacheKey = `${user?.id || "guest"}:${q}`
    const cached = token ? undefined : cacheRef.current.get(cacheKey)
    if (cached) {
      cacheRef.current.delete(cacheKey)
      cacheRef.current.set(cacheKey, cached)
      setStatus('')
      setOrgs(cached.orgs)
      setEvents(cached.events)
      setUsers(cached.users)
      return
    }

    const controller = new AbortController()
    setStatus('Searching...')

    fetch(orgUrl(`/api/network/search?q=${encodeURIComponent(q)}&limit=40`), {
      signal: controller.signal, cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then(async response => {
        if (!response.ok) throw new Error('Search is unavailable right now')
        const data = await response.json() as SearchCacheEntry
        if (controller.signal.aborted) return
        const orgRows = data.orgs
        const eventRows = data.events
        const userRows = data.users
        const next: SearchCacheEntry = {
          orgs: Array.isArray(orgRows) ? orgRows : [],
          events: Array.isArray(eventRows) ? eventRows : [],
          users: Array.isArray(userRows) ? userRows : [],
        }
        if (!token) cacheRef.current.set(cacheKey, next)
        if (cacheRef.current.size > CACHE_MAX) {
          const oldestKey = cacheRef.current.keys().next().value
          if (oldestKey) cacheRef.current.delete(oldestKey)
        }
        setOrgs(next.orgs)
        setEvents(next.events)
        setUsers(next.users)
        setStatus('')
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
        setOrgs([])
        setEvents([])
        setUsers([])
        setStatus(err instanceof Error ? err.message : 'Search failed')
      })

    return () => controller.abort()
  }, [q, token, user?.id])

  const total = useMemo(() => orgs.length + events.length + users.length, [events.length, orgs.length, users.length])

  return (
    <section className="panel search-page">
      <h1 style={{ marginTop: 0 }}>Search</h1>
      <GlobalSearchForm key={q} initialQuery={q} />
      {token && <p className="muted">Ranked for you using your memberships, connections, registrations, and favorites.</p>}
      {status ? <p className="muted">{status}</p> : <p className="muted">{total} results</p>}

      {!status ? (
        <div className="search-page-grid">
          {scope !== 'events' && scope !== 'people' ? (
            <section id="search-orgs" className="portal-card search-page-section">
            <h2>Organizations</h2>
            {orgs.length === 0 ? <p className="muted">No matching organizations.</p> : null}
            <div className="search-page-list">
              {orgs.map((org) => (
                <article key={org.id} className="search-page-item">
                  <OrgImage
                    src={org.image_url}
                    alt={org.name}
                    style={{ width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
                  />
                  <Link to={`/orgs/${encodeURIComponent(org.slug)}`} style={{ textDecoration: 'none', fontWeight: 700 }}>
                    {org.name}
                  </Link>
                  <span className="muted">
                    {org.membership_count ?? 0} members • {org.upcoming_events_count ?? 0} upcoming events
                  </span>
                  {org.description ? <span>{org.description}</span> : null}
                  {token ? (
                    <Link
                      to={`/chat?start=group&org=${encodeURIComponent(org.slug)}`}
                      className="btn-primary"
                      style={{ textDecoration: 'none', width: 'fit-content', marginTop: 4 }}
                    >
                      Message Group
                    </Link>
                  ) : (
                    <a
                      href={pidpAppLoginUrl(`/chat?start=group&org=${encodeURIComponent(org.slug)}`)}
                      className="btn-primary"
                      style={{ textDecoration: 'none', width: 'fit-content', marginTop: 4 }}
                    >
                      Message Group
                    </a>
                  )}
                </article>
              ))}
            </div>
            </section>
          ) : null}

          {scope !== 'orgs' && scope !== 'people' ? (
            <section id="search-events" className="portal-card search-page-section">
            <h2>Events</h2>
            {events.length === 0 ? <p className="muted">No matching events.</p> : null}
            <div className="search-page-list">
              {events.map((eventItem) => (
                <Link key={eventItem.id} to={`/events/${encodeURIComponent(eventItem.slug)}`} className="search-page-item">
                  {eventItem.image_url ? (
                    <img
                      src={eventItem.image_url}
                      alt={eventItem.title}
                      style={{ width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
                    />
                  ) : null}
                  <strong>{eventItem.title}</strong>
                  <span className="muted">
                    {formatEventDate(eventItem.starts_at)}
                    {eventItem.location ? ` • ${eventItem.location}` : ''}
                  </span>
                  {eventItem.description ? <span>{eventItem.description}</span> : null}
                </Link>
              ))}
            </div>
            </section>
          ) : null}

          {scope !== 'orgs' && scope !== 'events' ? (
            <section id="search-people" className="portal-card search-page-section">
            <h2>People</h2>
            {users.length === 0 ? <p className="muted">No matching people.</p> : null}
            <div className="search-page-list">
              {users.map((person) => (
                <article key={person.user_id} className="search-page-item">
                  {person.photo_url ? (
                    <img
                      src={person.photo_url}
                      alt={person.user_name}
                      style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: '50%', border: '1px solid var(--border)' }}
                    />
                  ) : null}
                  <Link to={`/users/${encodeURIComponent(person.slug)}`} style={{ textDecoration: 'none', fontWeight: 700 }}>
                    {person.user_name}
                  </Link>
                  <span className="muted">
                    {person.headline || `${person.upcoming_events_count ?? 0} upcoming hosted events`}
                  </span>
                  {person.bio ? <span>{person.bio}</span> : null}
                  {token ? (
                    <Link
                      to={`/chat?start=dm&user=${encodeURIComponent(person.slug)}`}
                      className="btn-primary"
                      style={{ textDecoration: 'none', width: 'fit-content', marginTop: 4 }}
                    >
                      Message
                    </Link>
                  ) : (
                    <a
                      href={pidpAppLoginUrl(`/chat?start=dm&user=${encodeURIComponent(person.slug)}`)}
                      className="btn-primary"
                      style={{ textDecoration: 'none', width: 'fit-content', marginTop: 4 }}
                    >
                      Message
                    </a>
                  )}
                </article>
              ))}
            </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
