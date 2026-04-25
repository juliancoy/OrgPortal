import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { setSeoMeta, upsertJsonLd } from '../../utils/seo'

const ORG_API_BASE = '/api/org'

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

type PublicEvent = {
  id: string
  title: string
  slug: string
  description?: string | null
  starts_at?: string | null
  ends_at?: string | null
  location?: string | null
  image_url?: string | null
}

function formatDate(value?: string | null) {
  if (!value) return 'TBD'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return 'TBD'
  return dt.toLocaleString()
}

function currentUrl() {
  return `${window.location.origin}/events`
}

export function PublicEventsPage() {
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [status, setStatus] = useState<string>('Loading upcoming events…')

  useEffect(() => {
    setSeoMeta({
      title: 'Upcoming Events • Org Portal',
      description: 'Browse upcoming events from users and organizations in the Org network.',
      canonicalUrl: currentUrl(),
      type: 'website',
    })
  }, [])

  useEffect(() => {
    fetch(orgUrl('/api/network/events/public?upcoming_only=true&limit=120'))
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Failed to load events (${resp.status})`)
        }
        return resp.json() as Promise<PublicEvent[]>
      })
      .then((data) => {
        setEvents(Array.isArray(data) ? data : [])
        setStatus('')
      })
      .catch((err) => {
        setEvents([])
        setStatus(err instanceof Error ? err.message : 'Unable to load events')
      })
  }, [])

  const itemListJsonLd = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Upcoming Events',
      itemListElement: events.slice(0, 50).map((event, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${window.location.origin}/events/${encodeURIComponent(event.slug)}`,
        name: event.title,
      })),
    }),
    [events],
  )

  useEffect(() => {
    upsertJsonLd('events-list', itemListJsonLd)
  }, [itemListJsonLd])

  return (
    <section className="panel" style={{ display: 'grid', gap: '1rem' }}>
      <h1 style={{ marginTop: 0 }}>Upcoming Events</h1>
      {status ? <p className="muted">{status}</p> : null}
      <div style={{ display: 'grid', gap: '0.9rem' }}>
        {events.map((event) => (
          <article
            key={event.id}
            className="portal-card"
            style={{
              display: 'flex',
              gap: '0.85rem',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}
          >
            {event.image_url ? (
              <img
                src={event.image_url}
                alt={event.title}
                style={{
                  width: 140,
                  height: 92,
                  objectFit: 'cover',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  flex: '0 0 auto',
                }}
              />
            ) : null}
            <div style={{ display: 'grid', gap: '0.45rem', minWidth: 220, flex: '1 1 360px' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                <Link to={`/events/${event.slug}`} style={{ textDecoration: 'none' }}>
                  {event.title}
                </Link>
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                {formatDate(event.starts_at)}{event.location ? ` • ${event.location}` : ''}
              </p>
              {event.description ? <p style={{ margin: 0 }}>{event.description}</p> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
