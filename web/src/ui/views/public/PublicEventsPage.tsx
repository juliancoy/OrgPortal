import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { setSeoMeta, upsertJsonLd } from '../../utils/seo'
import { useAuth } from '../../../app/AppProviders'
import { pidpAppLoginUrl } from '../../../config/pidp'
import { recordAttendanceWithRetry } from './attendanceApi'

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
  const { token } = useAuth()
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [status, setStatus] = useState<string>('Loading upcoming events…')
  const [attendingById, setAttendingById] = useState<Record<string, boolean>>({})
  const [attendanceStatusById, setAttendanceStatusById] = useState<Record<string, string>>({})
  const [attendingPendingById, setAttendingPendingById] = useState<Record<string, boolean>>({})

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

  async function markAttending(eventId: string) {
    setAttendingPendingById((prev) => ({ ...prev, [eventId]: true }))
    setAttendanceStatusById((prev) => ({ ...prev, [eventId]: '' }))
    try {
      const result = await recordAttendanceWithRetry(eventId, token)
      if (!result.ok) {
        throw new Error(result.message)
      }
      setAttendingById((prev) => ({ ...prev, [eventId]: true }))
      setAttendanceStatusById((prev) => ({ ...prev, [eventId]: result.message }))
    } catch (err) {
      setAttendanceStatusById((prev) => ({
        ...prev,
        [eventId]: err instanceof Error ? err.message : 'Unable to record attendance.',
      }))
    } finally {
      setAttendingPendingById((prev) => ({ ...prev, [eventId]: false }))
    }
  }

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
            <div style={{ display: 'grid', gap: '0.45rem', minWidth: 0, maxWidth: '100%', flex: '1 1 240px' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                <Link to={`/events/${event.slug}`} style={{ textDecoration: 'none' }}>
                  {event.title}
                </Link>
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                {formatDate(event.starts_at)}{event.location ? ` • ${event.location}` : ''}
              </p>
              {event.description ? <p style={{ margin: 0, overflowWrap: 'anywhere' }}>{event.description}</p> : null}
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {token ? (
                  <button
                    type="button"
                    onClick={() => markAttending(event.id)}
                    disabled={Boolean(attendingPendingById[event.id]) || Boolean(attendingById[event.id])}
                  >
                    {attendingPendingById[event.id]
                      ? 'Saving...'
                      : attendingById[event.id]
                        ? 'Attending'
                        : "I'm attending"}
                  </button>
                ) : (
                  <a href={pidpAppLoginUrl('/events')}>Login to indicate attendance</a>
                )}
                {attendanceStatusById[event.id] ? (
                  <span className="muted">{attendanceStatusById[event.id]}</span>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
