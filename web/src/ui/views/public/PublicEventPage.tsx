import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { setSeoMeta, upsertJsonLd } from '../../utils/seo'
import { useAuth } from '../../../app/AppProviders'
import { pidpAppLoginUrl } from '../../../config/pidp'
import { recordAttendanceWithRetry } from './attendanceApi'
import { toUserFacingErrorMessage } from '../../../infrastructure/http/userFacingError'

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

type PublicEventChatMessage = {
  event_id: string
  sender?: string | null
  body: string
  sent_at?: string | null
}

type PublicEventChat = {
  event_slug: string
  room_exists: boolean
  room_id?: string | null
  room_alias?: string | null
  room_name?: string | null
  messages: PublicEventChatMessage[]
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
  const { token } = useAuth()
  const { slug } = useParams()
  const [event, setEvent] = useState<PublicEvent | null>(null)
  const [status, setStatus] = useState<string>('Loading event…')
  const [attending, setAttending] = useState(false)
  const [attendancePending, setAttendancePending] = useState(false)
  const [attendanceStatus, setAttendanceStatus] = useState('')
  const [eventChat, setEventChat] = useState<PublicEventChat | null>(null)
  const [chatLoading, setChatLoading] = useState(false)
  const [chatStatus, setChatStatus] = useState('')

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
        setStatus(toUserFacingErrorMessage(err, 'Event unavailable'))
      })
  }, [slug])

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    setChatLoading(true)
    setChatStatus('')
    fetch(orgUrl(`/api/network/events/public/${encodeURIComponent(slug)}/chat`))
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Event chat unavailable (${resp.status})`)
        }
        return (await resp.json()) as PublicEventChat
      })
      .then((payload) => {
        if (cancelled) return
        setEventChat(payload)
      })
      .catch((err) => {
        if (cancelled) return
        setEventChat(null)
        setChatStatus(toUserFacingErrorMessage(err, 'Event chat unavailable'))
      })
      .finally(() => {
        if (cancelled) return
        setChatLoading(false)
      })
    return () => {
      cancelled = true
    }
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

  async function markAttending() {
    if (!event) return
    setAttendancePending(true)
    setAttendanceStatus('')
    try {
      const result = await recordAttendanceWithRetry(event.id, token)
      if (!result.ok) {
        throw new Error(result.message)
      }
      setAttending(true)
      setAttendanceStatus(result.message)
    } catch (err) {
      setAttendanceStatus(err instanceof Error ? err.message : 'Unable to record attendance.')
    } finally {
      setAttendancePending(false)
    }
  }

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
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {token ? (
          <button type="button" onClick={markAttending} disabled={attendancePending || attending}>
            {attendancePending ? 'Saving...' : attending ? 'Attending' : "I'm attending"}
          </button>
        ) : (
          <a href={pidpAppLoginUrl(`/events/${encodeURIComponent(event.slug)}`)}>Login to indicate attendance</a>
        )}
        {attendanceStatus ? <span className="muted">{attendanceStatus}</span> : null}
      </div>
      {event.source_url ? (
        <p style={{ margin: 0 }}>
          <a href={event.source_url} target="_blank" rel="noreferrer">
            Source / RSVP
          </a>
        </p>
      ) : null}
      <section className="portal-card" style={{ display: 'grid', gap: '0.55rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Event Chat</h2>
        {chatLoading ? (
          <p className="muted" style={{ margin: 0 }}>Loading event chat…</p>
        ) : null}
        {chatStatus ? (
          <p className="muted" style={{ margin: 0 }}>{chatStatus}</p>
        ) : null}
        {eventChat?.room_exists && eventChat.room_id ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              {eventChat.room_name || 'Event Chat'}
              {eventChat.room_alias ? ` • ${eventChat.room_alias}` : ''}
            </p>
            {token ? (
              <Link
                className="btn-primary"
                to={`/chat/${encodeURIComponent(eventChat.room_id)}`}
                style={{ textDecoration: 'none', width: 'fit-content' }}
              >
                Open Event Chat
              </Link>
            ) : (
              <a
                className="btn-primary"
                href={pidpAppLoginUrl(`/chat/${encodeURIComponent(eventChat.room_id)}`)}
                style={{ textDecoration: 'none', width: 'fit-content' }}
              >
                Login to Join Event Chat
              </a>
            )}
            {eventChat.messages?.length ? (
              <div style={{ display: 'grid', gap: '0.4rem' }}>
                {eventChat.messages.slice(-10).map((message) => (
                  <article key={message.event_id} style={{ borderLeft: '2px solid var(--border)', paddingLeft: '0.55rem' }}>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.body}</p>
                    <p className="muted" style={{ margin: 0 }}>
                      {message.sender || 'Unknown'} • {toLocalDateTime(message.sent_at)}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>No chat messages yet.</p>
            )}
          </>
        ) : !chatLoading && !chatStatus ? (
          <p className="muted" style={{ margin: 0 }}>Event chat room not available yet.</p>
        ) : null}
      </section>
    </article>
  )
}
