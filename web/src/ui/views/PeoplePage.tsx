import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { pidpAppLoginUrl } from '../../config/pidp'
import { setSeoMeta } from '../utils/seo'

const ORG_API_BASE = '/api/org'

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

type NetworkUser = {
  user_id: string
  user_name: string
  email: string
  created_at: string
  contact_slug?: string | null
  contact_enabled: boolean
  headline?: string | null
  photo_url?: string | null
}

export function PeoplePage() {
  const { token } = useAuth()
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<NetworkUser[]>([])
  const [status, setStatus] = useState('Loading people…')

  useEffect(() => {
    setSeoMeta({
      title: 'People • Org Portal',
      description: 'Browse the registered people directory across Org Portal.',
      canonicalUrl: `${window.location.origin}/people`,
      type: 'website',
    })
  }, [])

  useEffect(() => {
    if (!token) {
      setUsers([])
      setStatus('Sign in to view people.')
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        setStatus('Loading people…')
        const params = new URLSearchParams({
          limit: '500',
          sort: 'recent',
        })
        if (query.trim()) params.set('q', query.trim())
        const response = await fetch(orgUrl(`/api/network/users?${params.toString()}`), {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        if (!response.ok) {
          const text = await response.text().catch(() => '')
          throw new Error(text || `Failed to load people (${response.status})`)
        }
        const data = (await response.json()) as NetworkUser[]
        setUsers(Array.isArray(data) ? data : [])
        setStatus('')
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setUsers([])
        setStatus(error instanceof Error ? error.message : 'Unable to load people')
      }
    }, 180)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [token, query])

  const totalLabel = useMemo(() => `${users.length.toLocaleString()} people`, [users.length])

  return (
    <section className="panel" style={{ display: 'grid', gap: '1rem' }}>
      <h1 style={{ marginTop: 0 }}>People</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Registered users directory. {status ? status : totalLabel}
      </p>

      <label style={{ display: 'grid', gap: '0.35rem', maxWidth: 420 }}>
        <span className="muted">Filter people</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or email"
          aria-label="Search people by name or email"
        />
      </label>

      {!status && users.length === 0 ? <p className="muted">No people found.</p> : null}

      <div style={{ display: 'grid', gap: '0.9rem' }}>
        {users.map((person) => (
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
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
                {person.contact_slug && person.contact_enabled ? (
                  <Link to={`/users/${encodeURIComponent(person.contact_slug)}`} style={{ textDecoration: 'none' }}>
                    {person.user_name}
                  </Link>
                ) : (
                  person.user_name
                )}
              </h2>
              <p className="muted" style={{ margin: 0 }}>{person.email}</p>
              {person.headline ? <p style={{ margin: 0 }}>{person.headline}</p> : null}
              <p className="muted" style={{ margin: 0 }}>
                Joined {new Date(person.created_at).toLocaleDateString()}
              </p>
              {person.contact_slug ? (
                token ? (
                  <Link
                    to={`/chat?start=dm&user=${encodeURIComponent(person.contact_slug)}`}
                    className="btn-primary"
                    style={{ textDecoration: 'none', width: 'fit-content' }}
                  >
                    Message
                  </Link>
                ) : (
                  <a
                    href={pidpAppLoginUrl(`/chat?start=dm&user=${encodeURIComponent(person.contact_slug)}`)}
                    className="btn-primary"
                    style={{ textDecoration: 'none', width: 'fit-content' }}
                  >
                    Message
                  </a>
                )
              ) : (
                <span className="muted">No public chat link yet</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
