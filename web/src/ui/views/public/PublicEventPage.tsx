import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
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
  source_url?: string | null
  image_url?: string | null
}

function toLocalDateTime(value?: string | null) {
  if (!value) return 'TBD'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return 'TBD'
  return dt.toLocaleString()
}

function eventUrl(slug: string) {
  return `${window.location.origin}/events/${encodeURIComponent(slug)}`
}

function summary(text?: string | null) {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'Event details and schedule on Org Portal.'
  return cleaned.length > 280 ? `${cleaned.slice(0, 277)}...` : cleaned
}

export function PublicEventPage() {
  const { slug } = useParams()
  const [event, setEvent] = useState<PublicEvent | null>(null)
  const [status, setStatus] = useState<string>('Loading event…')

  useEffect(() => {
    if (!slug) return
    const canonical = eventUrl(slug)
    setSeoMeta({
      title: `Event • ${slug}`,
      description: 'Event details on Org Portal.',
      canonicalUrl: canonical,
      type: 'article',
    })
  }, [slug])

  useEffect(() => {
    if (!slug) return
    fetch(orgUrl(`/api/network/events/public/${encodeURIComponent(slug)}`))
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Event not found (${resp.status})`)
        }
        return resp.json() as Promise<PublicEvent>
      })
      .then((data) => {
        setEvent(data)
        setStatus('')
      })
      .catch((err) => {
        setEvent(null)
        setStatus(err instanceof Error ? err.message : 'Event unavailable')
      })
  }, [slug])

  useEffect(() => {
    if (!event) return
    setSeoMeta({
      title: `${event.title} • Org Portal`,
      description: summary(event.description),
      canonicalUrl: eventUrl(event.slug),
      imageUrl: event.image_url || undefined,
      type: 'article',
    })
  }, [event])

  const eventJsonLd = useMemo(() => {
    if (!event) return null
    return {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: event.title,
      description: summary(event.description),
      startDate: event.starts_at || undefined,
      endDate: event.ends_at || undefined,
      eventAttendanceMode: 'https://schema.org/MixedEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      image: event.image_url ? [event.image_url] : undefined,
      url: eventUrl(event.slug),
      location: event.location
        ? {
            '@type': 'Place',
            name: event.location,
          }
        : undefined,
      organizer: {
        '@type': 'Organization',
        name: 'Org Portal',
      },
    }
  }, [event])

  useEffect(() => {
    if (!eventJsonLd) return
    upsertJsonLd('event-detail', eventJsonLd)
  }, [eventJsonLd])

  if (!event) {
    return (
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>Event</h1>
        <p className="muted">{status}</p>
      </section>
    )
  }

  return (
    <article className="panel" style={{ display: 'grid', gap: '0.9rem' }}>
      <h1 style={{ marginTop: 0 }}>{event.title}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {toLocalDateTime(event.starts_at)}
        {event.ends_at ? ` → ${toLocalDateTime(event.ends_at)}` : ''}
      </p>
      {event.location ? <p style={{ margin: 0 }}><strong>Location:</strong> {event.location}</p> : null}
      {event.image_url ? (
        <img
          src={event.image_url}
          alt={event.title}
          style={{ width: '100%', maxWidth: 720, borderRadius: 12, border: '1px solid var(--border)' }}
        />
      ) : null}
      {event.description ? <p style={{ margin: 0 }}>{event.description}</p> : null}
      {event.source_url ? (
        <p style={{ margin: 0 }}>
          <a href={event.source_url} target="_blank" rel="noreferrer">
            Source / RSVP
          </a>
        </p>
      ) : null}
    </article>
  )
}

