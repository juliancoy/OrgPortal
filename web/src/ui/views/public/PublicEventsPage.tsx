import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { setSeoMeta, upsertJsonLd } from '../../utils/seo'
import { downloadIcsEvent, outlookCalendarUrl } from '../../utils/calendar'
import { useAuth } from '../../../app/AppProviders'
import { pidpAppLoginUrl } from '../../../config/pidp'
import { recordAttendanceWithRetry } from './attendanceApi'
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
  image_url?: string | null
}

function formatDate(value?: string | null) {
  if (!value) return 'TBD'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return 'TBD'
  return dt.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function shortDescription(value?: string | null) {
  const text = (value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > 190 ? `${text.slice(0, 187)}...` : text
}

function currentUrl() {
  return `${window.location.origin}${window.location.pathname}`
}

function eventPublicUrl(event: PublicEvent) {
  return `${window.location.origin}/events/${encodeURIComponent(event.slug)}`
}

export function PublicEventsPage({
  sourcePath = '/api/network/events/public?upcoming_only=true&limit=120',
  heading = 'Upcoming Events',
  description = 'Browse upcoming events from users and organizations in the Org network.',
  emptyMessage = 'No upcoming events are listed right now.',
}: { sourcePath?: string; heading?: string; description?: string; emptyMessage?: string } = {}) {
  const { token } = useAuth()
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [status, setStatus] = useState<string>('Loading upcoming events…')
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false)
  const [microsoftCalendarConnected, setMicrosoftCalendarConnected] = useState(false)
  const [attendingById, setAttendingById] = useState<Record<string, boolean>>({})
  const [attendanceStatusById, setAttendanceStatusById] = useState<Record<string, string>>({})
  const [attendingPendingById, setAttendingPendingById] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setSeoMeta({
      title: `${heading} • Org Portal`,
      description,
      canonicalUrl: currentUrl(),
      type: 'website',
    })
  }, [heading, description])

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
    const controller = new AbortController()
    setEvents([])
    setStatus('Loading upcoming events…')
    fetch(orgUrl(sourcePath), { signal: controller.signal })
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Failed to load events (${resp.status})`)
        }
        const data = await resp.json()
        if (!Array.isArray(data)) throw new Error('The event listing is unavailable.')
        return data as PublicEvent[]
      })
      .then((data) => {
        setEvents(Array.isArray(data) ? data : [])
        setStatus('')
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setEvents([])
        setStatus(err instanceof Error ? err.message : 'Unable to load events')
      })
    return () => controller.abort()
  }, [sourcePath])

  const itemListJsonLd = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: heading,
      itemListElement: events.slice(0, 50).map((event, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${window.location.origin}/events/${encodeURIComponent(event.slug)}`,
        name: event.title,
      })),
    }),
    [events, heading],
  )

  useEffect(() => {
    upsertJsonLd('events-list', itemListJsonLd)
  }, [itemListJsonLd])

  async function markAttending(eventId: string) {
    const event = events.find((item) => item.id === eventId)
    if (!event) return
    setAttendingPendingById((prev) => ({ ...prev, [eventId]: true }))
    setAttendanceStatusById((prev) => ({ ...prev, [eventId]: '' }))
    try {
      const result = await recordAttendanceWithRetry(eventId, token)
      if (!result.ok) {
        throw new Error(result.message)
      }
      let message = result.message
      if (googleCalendarConnected && event.starts_at) {
        const calendarResult = await savePortalEventToGoogleCalendar(token, {
          external_event_id: `portal-event:${event.id}`,
          summary: event.title,
          description: event.description || 'Event saved from Org Portal.',
          starts_at: event.starts_at,
          ends_at: event.ends_at || event.starts_at,
          location: event.location || null,
          source_url: `${window.location.origin}/events/${encodeURIComponent(event.slug)}`,
        })
        if (calendarResult.connected) {
          message = 'Attendance saved and added to Google Calendar.'
        }
      } else if (microsoftCalendarConnected && event.starts_at) {
        const calendarResult = await savePortalEventToMicrosoftCalendar(token, {
          external_event_id: `portal-event:${event.id}`,
          summary: event.title,
          description: event.description || 'Event saved from Org Portal.',
          starts_at: event.starts_at,
          ends_at: event.ends_at || event.starts_at,
          location: event.location || null,
          source_url: `${window.location.origin}/events/${encodeURIComponent(event.slug)}`,
        })
        if (calendarResult.connected) {
          message = 'Attendance saved and added to Microsoft Calendar.'
        }
      }
      setAttendingById((prev) => ({ ...prev, [eventId]: true }))
      setAttendanceStatusById((prev) => ({ ...prev, [eventId]: message }))
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
    <section className="public-events-page">
      <div className="public-events-heading">
        <p className="public-event-eyebrow">Events</p>
        <h1>{heading}</h1>
        <p className="muted">{description}</p>
      </div>
      {status ? <p className="muted">{status}</p> : null}
      {!status && events.length === 0 && <p role="status">{emptyMessage}</p>}
      <div className="public-events-list">
        {events.map((event) => (
          (() => {
            const eventStart = event.starts_at
            const eventEnd = event.ends_at || eventStart || null
            return (
              <article
                key={event.id}
                className="portal-card public-event-list-card"
              >
                {event.image_url ? (
                  <img
                    src={event.image_url}
                    alt={event.title}
                    className="public-event-list-image"
                  />
                ) : null}
                <div className="public-event-list-body">
                  <div className="public-event-list-title-row">
                    <h2>
                      <Link to={`/events/${event.slug}`}>
                      {event.title}
                      </Link>
                    </h2>
                    <Link className="public-event-open-link" to={`/events/${event.slug}`}>View details</Link>
                  </div>
                  <div className="public-event-list-meta">
                    <span>{formatDate(event.starts_at)}</span>
                    {event.location ? <span>{event.location}</span> : null}
                  </div>
                  {event.description ? <p className="public-event-list-description">{shortDescription(event.description)}</p> : null}
                  <div className="public-event-list-actions">
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
                              : googleCalendarConnected
                                ? 'Attend: add to Google Calendar'
                                : microsoftCalendarConnected
                                  ? 'Attend: add to Microsoft Calendar'
                                  : 'Attend'}
                      </button>
                    ) : (
                      <a className="btn-primary" href={pidpAppLoginUrl('/events')}>Log in to attend</a>
                    )}
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
                            url: eventPublicUrl(event),
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
                            url: eventPublicUrl(event),
                          })}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Outlook
                        </a>
                      </>
                    ) : null}
                    {attendanceStatusById[event.id] ? (
                      <span className="muted">{attendanceStatusById[event.id]}</span>
                    ) : null}
                  </div>
                </div>
              </article>
            )
          })()
        ))}
      </div>
    </section>
  )
}
