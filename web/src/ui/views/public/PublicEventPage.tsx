import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { setSeoMeta, upsertJsonLd } from '../../utils/seo'
import { downloadIcsEvent, outlookCalendarUrl } from '../../utils/calendar'
import { useAuth } from '../../../app/AppProviders'
import { pidpAppLoginUrl } from '../../../config/pidp'
import { EventRegistration } from './EventRegistration'
import { toUserFacingErrorMessage } from '../../../infrastructure/http/userFacingError'
import { loadGoogleCalendarConnection, savePortalEventToGoogleCalendar } from '../googleCalendarApi'
import { loadMicrosoftCalendarConnection, savePortalEventToMicrosoftCalendar } from '../microsoftCalendarApi'

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
  organization_name?: string | null
  host_org_name?: string | null
  host_org_id?: string | null
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
  return dt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function toEventDate(value?: string | null) {
  if (!value) return 'Date TBD'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return 'Date TBD'
  return dt.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function toEventTimeRange(start?: string | null, end?: string | null) {
  if (!start) return 'Time TBD'
  const startDate = new Date(start)
  if (Number.isNaN(startDate.getTime())) return 'Time TBD'
  const startText = startDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (!end) return startText
  const endDate = new Date(end)
  if (Number.isNaN(endDate.getTime())) return startText
  return `${startText} to ${endDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

function eventUrl(slug: string) {
  return `${window.location.origin}/events/${encodeURIComponent(slug)}`
}

function summary(text?: string | null) {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'Event details and schedule on Org Portal.'
  return cleaned.length > 280 ? `${cleaned.slice(0, 277)}...` : cleaned
}

function getEventOrganizerName(event: PublicEvent) {
  const candidate = event.organization_name || event.host_org_name
  return candidate?.trim() || 'Code Collective'
}

function getEventOfferValidFrom(event: PublicEvent) {
  const start = event.starts_at ? new Date(event.starts_at) : null
  if (start && !Number.isNaN(start.getTime())) {
    const now = new Date()
    return (start.getTime() < now.getTime() ? start : now).toISOString()
  }
  return new Date().toISOString()
}

export function PublicEventPage() {
  const { token, user } = useAuth()
  const { slug } = useParams()
  const [event, setEvent] = useState<PublicEvent | null>(null)
  const [status, setStatus] = useState<string>('Loading event…')
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false)
  const [microsoftCalendarConnected, setMicrosoftCalendarConnected] = useState(false)
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
    if (!token) {
      setGoogleCalendarConnected(false)
      setMicrosoftCalendarConnected(false)
      return
    }
    Promise.allSettled([loadGoogleCalendarConnection(token), loadMicrosoftCalendarConnection(token)])
      .then(([googleResult, microsoftResult]) => {
        setGoogleCalendarConnected(googleResult.status === 'fulfilled' ? Boolean(googleResult.value.connected) : false)
        setMicrosoftCalendarConnected(microsoftResult.status === 'fulfilled' ? Boolean(microsoftResult.value.connected) : false)
      })
      .catch(() => {
        setGoogleCalendarConnected(false)
        setMicrosoftCalendarConnected(false)
      })
  }, [token])

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    setEvent(null)
    setStatus('Loading event…')
    fetch(orgUrl(`/api/network/events/public/${encodeURIComponent(slug)}`))
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Event not found (${resp.status})`)
        }
        return resp.json() as Promise<PublicEvent>
      })
      .then((data) => {
        if (cancelled) return
        setEvent(data)
        setStatus('')
      })
      .catch((err) => {
        if (cancelled) return
        setEvent(null)
        setStatus(toUserFacingErrorMessage(err, 'Event unavailable'))
      })
    return () => { cancelled = true }
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
    const organizerName = getEventOrganizerName(event)
    const sourceUrl = event.source_url?.trim() || eventUrl(event.slug)
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
        name: organizerName,
      },
      performer: {
        '@type': 'Organization',
        name: organizerName,
      },
      offers: {
        '@type': 'Offer',
        url: sourceUrl,
        price: '0',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        validFrom: getEventOfferValidFrom(event),
      },
    }
  }, [event])

  useEffect(() => {
    if (!eventJsonLd) return
    upsertJsonLd('event-detail', eventJsonLd)
  }, [eventJsonLd])

  async function saveToCalendar() {
    if (!event?.starts_at) return
    const calendarEvent = {
      external_event_id: `portal-event:${event.id}`,
      summary: event.title,
      description: event.description || 'Event saved from Org Portal.',
      starts_at: event.starts_at,
      ends_at: event.ends_at || event.starts_at,
      location: event.location || null,
      source_url: event.source_url || eventUrl(event.slug),
    }
    if (googleCalendarConnected) {
      const result = await savePortalEventToGoogleCalendar(token, calendarEvent)
      if (result.connected) return 'You’re registered and the event was added to Google Calendar.'
    } else if (microsoftCalendarConnected) {
      const result = await savePortalEventToMicrosoftCalendar(token, calendarEvent)
      if (result.connected) return 'You’re registered and the event was added to Microsoft Calendar.'
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

  const eventStart = event.starts_at
  const eventEnd = event.ends_at || eventStart || null

  return (
    <article className="public-event-page">
      <section className="public-event-hero">
        {event.image_url ? (
          <img className="public-event-hero-image" src={event.image_url} alt="" />
        ) : <div className="public-event-hero-image public-event-hero-placeholder" aria-hidden="true" />}
        <div className="public-event-hero-content">
          <p className="public-event-eyebrow">{getEventOrganizerName(event)}</p>
          <h1>{event.title}</h1>
          <div className="public-event-facts" aria-label="Event details">
            <div>
              <span>Date</span>
              <strong>{toEventDate(event.starts_at)}</strong>
            </div>
            <div>
              <span>Time</span>
              <strong>{toEventTimeRange(event.starts_at, event.ends_at)}</strong>
            </div>
            {event.location ? (
              <div>
                <span>Location</span>
                <strong>{event.location}</strong>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="public-event-layout">
        <main className="public-event-main">
          {event.description ? (
            <section className="portal-card public-event-description">
              <div className="public-event-card-heading">
                <p className="public-event-eyebrow">About The Event</p>
                <h2>What To Expect</h2>
              </div>
              <p>{event.description}</p>
            </section>
          ) : null}
          <section className="portal-card public-event-calendar-card">
            <div className="public-event-card-heading">
              <p className="public-event-eyebrow">Calendar</p>
              <h2>Add It To Your Schedule</h2>
            </div>
            <div className="public-event-actions">
        {eventStart && eventEnd ? (
          <>
            <button
              type="button"
              className="portal-button-secondary"
              onClick={() => downloadIcsEvent({
                title: event.title,
                description: event.description || 'Event from Org Portal.',
                location: event.location || null,
                startsAt: eventStart,
                endsAt: eventEnd,
                url: event.source_url || eventUrl(event.slug),
              })}
            >
              Download .ics
            </button>
            <a
              href={outlookCalendarUrl({
                title: event.title,
                description: event.description || 'Event from Org Portal.',
                location: event.location || null,
                startsAt: eventStart,
                endsAt: eventEnd,
                url: event.source_url || eventUrl(event.slug),
              })}
              target="_blank"
              rel="noreferrer"
            >
              Outlook
            </a>
          </>
        ) : null}
            </div>
          </section>
      {event.source_url ? (
        <p style={{ margin: 0, overflowWrap: 'anywhere' }}>
          <a href={event.source_url} target="_blank" rel="noreferrer">
            Source / RSVP
          </a>
        </p>
      ) : null}
      <section className="portal-card public-event-chat">
        <div className="public-event-card-heading">
          <p className="public-event-eyebrow">Conversation</p>
          <h2>Event Chat</h2>
        </div>
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
        </main>
        <aside className="public-event-side">
          <EventRegistration key={`${event.id}:${user?.id || 'guest'}:${Boolean(token)}`}
            eventId={event.id} slug={event.slug} token={token} saveToCalendar={saveToCalendar}
            organizationName={event.host_org_id ? event.organization_name || event.host_org_name : null} />
        </aside>
      </div>
    </article>
  )
}
