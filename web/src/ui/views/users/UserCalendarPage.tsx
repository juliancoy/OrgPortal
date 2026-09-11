import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { pidpUrl } from '../../../config/pidp'
import {
  disconnectGoogleCalendarConnection,
  loadGoogleCalendarConnection,
  loadUpcomingGoogleCalendarEvents,
  type GoogleCalendarConnection,
  type GoogleCalendarListItem,
} from '../googleCalendarApi'
import {
  disconnectMicrosoftCalendarConnection,
  loadMicrosoftCalendarConnection,
  loadUpcomingMicrosoftCalendarEvents,
  type MicrosoftCalendarConnection,
  type MicrosoftCalendarListItem,
} from '../microsoftCalendarApi'
import {
  loadRegisteredEventsCalendarFeed,
  regenerateRegisteredEventsCalendarFeed,
  type RegisteredEventsCalendarFeed,
} from '../public/attendanceApi'

function formatDateTime(value?: string | null) {
  if (!value) return 'TBD'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

export function UserCalendarPage() {
  const { role, token } = useAuth()
  const [googleConnection, setGoogleConnection] = useState<GoogleCalendarConnection | null>(null)
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarListItem[]>([])
  const [microsoftConnection, setMicrosoftConnection] = useState<MicrosoftCalendarConnection | null>(null)
  const [microsoftEvents, setMicrosoftEvents] = useState<MicrosoftCalendarListItem[]>([])
  const [registeredEventsFeed, setRegisteredEventsFeed] = useState<RegisteredEventsCalendarFeed | null>(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [feedBusy, setFeedBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refreshCalendarState() {
    const [googleCalendar, microsoftCalendar, feed] = await Promise.all([
      loadGoogleCalendarConnection(token),
      loadMicrosoftCalendarConnection(token),
      loadRegisteredEventsCalendarFeed(token),
    ])
    setGoogleConnection(googleCalendar)
    setMicrosoftConnection(microsoftCalendar)
    setRegisteredEventsFeed(feed)
    if (googleCalendar.connected) {
      const listing = await loadUpcomingGoogleCalendarEvents(token, 12)
      setGoogleEvents(Array.isArray(listing.events) ? listing.events : [])
    } else {
      setGoogleEvents([])
    }
    if (microsoftCalendar.connected) {
      const listing = await loadUpcomingMicrosoftCalendarEvents(token, 12)
      setMicrosoftEvents(Array.isArray(listing.events) ? listing.events : [])
    } else {
      setMicrosoftEvents([])
    }
  }

  useEffect(() => {
    document.title = 'Org Portal • Calendar Integrations'
  }, [])

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    refreshCalendarState()
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load calendar.'))
      .finally(() => setLoading(false))
  }, [token])

  async function disconnectGoogleCalendar() {
    setDisconnecting(true)
    setError('')
    setMessage('')
    try {
      await disconnectGoogleCalendarConnection(token)
      await refreshCalendarState()
      setMessage('Google Calendar disconnected.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to disconnect Google Calendar.')
    } finally {
      setDisconnecting(false)
    }
  }

  async function disconnectMicrosoftCalendar() {
    setDisconnecting(true)
    setError('')
    setMessage('')
    try {
      await disconnectMicrosoftCalendarConnection(token)
      await refreshCalendarState()
      setMessage('Microsoft Calendar disconnected.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to disconnect Microsoft Calendar.')
    } finally {
      setDisconnecting(false)
    }
  }

  async function copyFeedUrl() {
    if (!registeredEventsFeed) return
    try {
      await navigator.clipboard.writeText(registeredEventsFeed.feed_url)
      setMessage('Registered events calendar link copied.')
      setError('')
    } catch {
      setError('Unable to copy the calendar link. You can select and copy it below.')
      setMessage('')
    }
  }

  async function regenerateFeedUrl() {
    setFeedBusy(true)
    setError('')
    setMessage('')
    try {
      setRegisteredEventsFeed(await regenerateRegisteredEventsCalendarFeed(token))
      setMessage('Registered events calendar link regenerated.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to regenerate registered events calendar.')
    } finally {
      setFeedBusy(false)
    }
  }

  if (role === 'guest') {
    return (
      <main className="portal-page">
        <section className="panel">
          <h1 style={{ marginTop: 0 }}>Calendar Integrations</h1>
          <p className="muted">Sign in required.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="portal-page" style={{ display: 'grid', gap: '1rem' }}>
      <section className="portal-page-heading">
        <div>
          <p className="portal-eyebrow">Account</p>
          <h1>Calendar Integrations</h1>
          <p className="portal-muted">Connect calendar providers and subscribe to every event you register for.</p>
        </div>
        <Link className="portal-button secondary" to="/settings">
          Settings
        </Link>
      </section>

      {error ? <div className="health-insurance-alert error" role="alert">{error}</div> : null}
      {message ? <div className="health-insurance-alert success" role="status">{message}</div> : null}

      <section className="portal-card registered-events-calendar-card">
        <div>
          <p className="portal-eyebrow">Registered Events</p>
          <h2>Subscribe Once</h2>
          <p className="portal-muted">
            Your calendar app will stay synced with events you register for or cancel.
          </p>
        </div>
        {loading ? (
          <p className="portal-muted" style={{ margin: 0 }}>Loading subscription options…</p>
        ) : registeredEventsFeed ? (
          <>
            <div className="registered-events-calendar-stats" aria-label="Registered event calendar summary">
              <strong>{registeredEventsFeed.event_count}</strong>
              <span>{registeredEventsFeed.event_count === 1 ? 'registered event' : 'registered events'}</span>
            </div>
            <div className="registered-events-calendar-actions">
              <a className="portal-button" href={registeredEventsFeed.webcal_url}>Apple/iCal</a>
              <a className="portal-button" href={registeredEventsFeed.google_url} target="_blank" rel="noreferrer">Google Calendar</a>
              <a className="portal-button" href={registeredEventsFeed.outlook_url} target="_blank" rel="noreferrer">Outlook</a>
              <a className="portal-button secondary" href={registeredEventsFeed.download_url}>Download .ics</a>
              <button type="button" className="portal-button secondary" onClick={() => void copyFeedUrl()}>Copy Link</button>
              <button type="button" className="portal-button-secondary" onClick={() => void regenerateFeedUrl()} disabled={feedBusy}>
                {feedBusy ? 'Regenerating…' : 'Regenerate Link'}
              </button>
            </div>
            <input className="registered-events-calendar-url" readOnly value={registeredEventsFeed.feed_url} onFocus={(event) => event.currentTarget.select()} />
            <p className="portal-muted" style={{ margin: 0 }}>
              Regenerate the link if it was shared by mistake. Calendar apps may take a little while to refresh subscriptions.
            </p>
          </>
        ) : (
          <p className="portal-muted" style={{ margin: 0 }}>Unable to load registered event subscription options.</p>
        )}
      </section>

      <section className="portal-card" style={{ display: 'grid', gap: '0.8rem' }}>
        <div style={{ display: 'grid', gap: '0.45rem' }}>
          <h2 style={{ margin: 0 }}>Google Calendar Integration</h2>
          {loading ? (
            <p className="portal-muted" style={{ margin: 0 }}>Loading calendar connection…</p>
          ) : googleConnection?.connected ? (
            <>
              <p className="portal-muted" style={{ margin: 0 }}>
                Connected as {googleConnection.google_email || 'Google account'}.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <a
                  className="portal-button"
                  href="https://calendar.google.com/calendar/u/0/r"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Google Calendar
                </a>
                <button type="button" className="portal-button secondary" onClick={() => void disconnectGoogleCalendar()} disabled={disconnecting}>
                  {disconnecting ? 'Disconnecting…' : 'Disconnect Google Calendar'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="portal-muted" style={{ margin: 0 }}>
                Connect Google Calendar to see your schedule here and add portal events with a single click from event pages.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <a
                  className="portal-button"
                  href={pidpUrl(`/auth/google-calendar/connect?next=${encodeURIComponent(window.location.href)}`)}
                >
                  Connect Google Calendar
                </a>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="portal-card" style={{ display: 'grid', gap: '0.8rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Upcoming Google Calendar events</h2>
          <p className="portal-muted" style={{ margin: '0.4rem 0 0' }}>
            {googleConnection?.connected ? 'These are the next items from your connected Google calendar.' : 'Connect Google Calendar to load upcoming events here.'}
          </p>
        </div>
        {!googleConnection?.connected ? null : googleEvents.length ? (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {googleEvents.map((event) => (
              <article key={event.id} className="portal-card" style={{ display: 'grid', gap: '0.35rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong>{event.summary}</strong>
                  {event.html_link ? (
                    <a href={event.html_link} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : null}
                </div>
                <span className="portal-muted">{formatDateTime(event.starts_at)}{event.ends_at ? ` to ${formatDateTime(event.ends_at)}` : ''}</span>
                {event.location ? <span>{event.location}</span> : null}
                {event.description ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{event.description}</p> : null}
              </article>
            ))}
          </div>
        ) : googleConnection?.connected && !loading ? (
          <p className="portal-muted" style={{ margin: 0 }}>No upcoming Google Calendar events found.</p>
        ) : null}
      </section>

      <section className="portal-card" style={{ display: 'grid', gap: '0.8rem' }}>
        <div style={{ display: 'grid', gap: '0.45rem' }}>
          <h2 style={{ margin: 0 }}>Microsoft Calendar Integration</h2>
          {loading ? (
            <p className="portal-muted" style={{ margin: 0 }}>Loading calendar connection…</p>
          ) : microsoftConnection?.connected ? (
            <>
              <p className="portal-muted" style={{ margin: 0 }}>
                Connected as {microsoftConnection.microsoft_email || 'Microsoft account'}.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <a
                  className="portal-button"
                  href="https://outlook.live.com/calendar/0/view/month"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Microsoft Calendar
                </a>
                <button type="button" className="portal-button secondary" onClick={() => void disconnectMicrosoftCalendar()} disabled={disconnecting}>
                  {disconnecting ? 'Disconnecting…' : 'Disconnect Microsoft Calendar'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="portal-muted" style={{ margin: 0 }}>
                Connect Microsoft Calendar to add portal events directly to your Outlook or Microsoft 365 calendar.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <a
                  className="portal-button"
                  href={pidpUrl(`/auth/microsoft-calendar/connect?next=${encodeURIComponent(window.location.href)}`)}
                >
                  Connect Microsoft Calendar
                </a>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="portal-card" style={{ display: 'grid', gap: '0.8rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Upcoming Microsoft Calendar events</h2>
          <p className="portal-muted" style={{ margin: '0.4rem 0 0' }}>
            {microsoftConnection?.connected ? 'These are the next items from your connected Microsoft calendar.' : 'Connect Microsoft Calendar to load upcoming events here.'}
          </p>
        </div>
        {!microsoftConnection?.connected ? null : microsoftEvents.length ? (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {microsoftEvents.map((event) => (
              <article key={event.id} className="portal-card" style={{ display: 'grid', gap: '0.35rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong>{event.summary}</strong>
                  {event.web_link ? (
                    <a href={event.web_link} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : null}
                </div>
                <span className="portal-muted">{formatDateTime(event.starts_at)}{event.ends_at ? ` to ${formatDateTime(event.ends_at)}` : ''}</span>
                {event.location ? <span>{event.location}</span> : null}
                {event.description ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{event.description}</p> : null}
              </article>
            ))}
          </div>
        ) : microsoftConnection?.connected && !loading ? (
          <p className="portal-muted" style={{ margin: 0 }}>No upcoming Microsoft Calendar events found.</p>
        ) : null}
      </section>
    </main>
  )
}
