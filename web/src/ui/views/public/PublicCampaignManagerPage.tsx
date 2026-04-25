import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { setSeoMeta, upsertJsonLd } from '../../utils/seo'

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
}

type PublicEvent = {
  id: string
  title: string
  slug: string
  description?: string | null
  starts_at?: string | null
  location?: string | null
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
  const { handle } = useParams()
  const [org, setOrg] = useState<PublicOrganization | null>(null)
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [status, setStatus] = useState<string>('Loading organization…')

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
    Promise.all([
      fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(handle)}`)).then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Organization not found (${resp.status})`)
        }
        return resp.json() as Promise<PublicOrganization>
      }),
      fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(handle)}/events?upcoming_only=true&limit=12`)).then(
        async (resp) => {
          if (!resp.ok) return []
          return (await resp.json()) as PublicEvent[]
        },
      ),
    ])
      .then(([orgData, eventData]) => {
        setOrg(orgData)
        setEvents(Array.isArray(eventData) ? eventData : [])
        setStatus('')
      })
      .catch((err) => {
        setOrg(null)
        setEvents([])
        setStatus(err instanceof Error ? err.message : 'Organization unavailable')
      })
  }, [handle])

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

  if (!org) {
    return (
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>Organization</h1>
        <p className="muted">{status}</p>
        <Link to="/">Back to home</Link>
      </section>
    )
  }

  return (
    <section className="panel" style={{ display: 'grid', gap: '0.85rem' }}>
      <h1 style={{ marginTop: 0 }}>{org.name}</h1>
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

      <div className="portal-card" style={{ display: 'grid', gap: '0.6rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Upcoming Events</h2>
        {events.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No upcoming events listed.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {events.map((event) => (
              <article key={event.id} style={{ display: 'grid', gap: '0.25rem' }}>
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
