import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { setSeoMeta, upsertJsonLd } from '../../utils/seo'
import { downloadIcsEvent, outlookCalendarUrl } from '../../utils/calendar'
import { useAuth } from '../../../app/AppProviders'
import { pidpAppLoginUrl } from '../../../config/pidp'
import { loadAttendance, recordAttendanceWithRetry, type EventAttendance } from './attendanceApi'
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

function currentPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}` || '/events'
}

export function PublicEventsPage({
  sourcePath = '/api/network/events/public?upcoming_only=true&limit=120',
  heading = 'Upcoming Events',
  description = 'Browse upcoming events from users and organizations in the Org network.',
  emptyMessage = 'No upcoming events are listed right now.',
}: { sourcePath?: string; heading?: string; description?: string; emptyMessage?: string } = {}) {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [status, setStatus] = useState<string>('Loading upcoming events…')
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false)
  const [microsoftCalendarConnected, setMicrosoftCalendarConnected] = useState(false)
  const [attendanceById, setAttendanceById] = useState<Record<string, EventAttendance>>({})
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

  useEffect(() => {
    if (!token || events.length === 0) {
      setAttendanceById({})
      return
    }
    let cancelled = false
    Promise.allSettled(events.map((event) => loadAttendance(event.id, token)))
      .then((results) => {
        if (cancelled) return
        const next: Record<string, EventAttendance> = {}
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') next[events[index].id] = result.value
        })
        setAttendanceById(next)
      })
      .catch(() => {
        if (!cancelled) setAttendanceById({})
      })
    return () => {
      cancelled = true
    }
  }, [events, token])

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

  function openEventCard(event: PublicEvent) {
    navigate(`/events/${encodeURIComponent(event.slug)}`)
  }

  function handleCardClick(event: MouseEvent<HTMLElement>, item: PublicEvent) {
    const target = event.target as HTMLElement | null
    if (target?.closest('a, button, input, select, textarea, [role="button"]')) return
    openEventCard(item)
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>, item: PublicEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const target = event.target as HTMLElement | null
    if (target?.closest('a, button, input, select, textarea, [role="button"]')) return
    event.preventDefault()
    openEventCard(item)
  }

  async function updateAttendance(eventId: string) {
    const event = events.find((item) => item.id === eventId)
    if (!event) return
    setAttendingPendingById((prev) => ({ ...prev, [eventId]: true }))
    setAttendanceStatusById((prev) => ({ ...prev, [eventId]: '' }))
    try {
      const wasRegistered = Boolean(attendanceById[eventId]?.registered)
      const result = await recordAttendanceWithRetry(eventId, token, wasRegistered ? 'DELETE' : 'POST')
      if (!result.ok) {
        throw new Error(result.message)
      }
      let message = result.message
      if (!wasRegistered && googleCalendarConnected && event.starts_at) {
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
      } else if (!wasRegistered && microsoftCalendarConnected && event.starts_at) {
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
      setAttendanceById((prev) => result.attendance ? ({ ...prev, [eventId]: result.attendance }) : prev)
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
            const attendance = attendanceById[event.id]
            const registered = Boolean(attendance?.registered)
            const attendanceLoaded = Boolean(attendance)
            const registrationLabel = registered
              ? 'You’re registered'
              : attendanceLoaded
                ? 'Not registered yet'
                : token
                  ? 'Checking registration…'
                  : 'Login required'
            const actionLabel = attendingPendingById[event.id]
              ? 'Saving…'
              : registered
                ? 'Cancel registration'
                : googleCalendarConnected
                  ? 'Register + Google Calendar'
                  : microsoftCalendarConnected
                    ? 'Register + Microsoft Calendar'
                    : 'Register'
            return (
              <article
                key={event.id}
                className="portal-card public-event-list-card public-event-list-card-clickable"
                role="link"
                tabIndex={0}
                aria-label={`Open event details for ${event.title}`}
                onClick={(clickEvent) => handleCardClick(clickEvent, event)}
                onKeyDown={(keyEvent) => handleCardKeyDown(keyEvent, event)}
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
                    <h2>{event.title}</h2>
                  </div>
                  <div className="public-event-list-meta">
                    <span>{formatDate(event.starts_at)}</span>
                    {event.location ? <span>{event.location}</span> : null}
                  </div>
                  {event.description ? <p className="public-event-list-description">{shortDescription(event.description)}</p> : null}
                  <div className="public-event-rsvp-panel" aria-label={`Registration status for ${event.title}`}>
                    <div className={`public-event-rsvp-state${registered ? ' is-registered' : ''}`}>
                      <span>{registrationLabel}</span>
                      {typeof attendance?.count === 'number' ? <strong>{attendance.count} {attendance.count === 1 ? 'registrant' : 'registrants'}</strong> : null}
                    </div>
                    <div className="public-event-list-actions">
                      {token ? (
                        <button
                          type="button"
                          className={registered ? 'public-event-rsvp-button public-event-rsvp-button-cancel' : 'public-event-rsvp-button'}
                          onClick={() => updateAttendance(event.id)}
                          disabled={Boolean(attendingPendingById[event.id]) || !attendanceLoaded}
                          aria-pressed={registered}
                        >
                          {actionLabel}
                        </button>
                      ) : (
                        <a className="public-event-rsvp-button" href={pidpAppLoginUrl(currentPath())}>Log in to register</a>
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
                            className="public-event-calendar-link"
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
                        <span className="public-event-rsvp-message" role="status">{attendanceStatusById[event.id]}</span>
                      ) : null}
                    </div>
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
