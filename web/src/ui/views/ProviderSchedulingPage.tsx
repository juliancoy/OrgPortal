import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../app/AppProviders'
import { pidpUrl } from '../../config/pidp'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'

const ORG_API_BASE = '/api/org'

type HostOrganization = { id: string; name: string; slug: string; my_role?: 'owner' | 'administrator' | 'member' | null }
type GoogleCalendarConnection = {
  connected: boolean
  google_email: string | null
  calendar_id: string | null
  sync_busy: boolean
  updated_at: string | null
}
type ProviderService = {
  id: string
  name: string
  description: string
  timezone: string
  slot_minutes: number
  available_to_all: boolean
  host_type: 'shared' | 'individual' | 'org'
  host_user_id?: string | null
  host_user_name?: string | null
  host_org_id?: string | null
  host_org_name?: string | null
  google_calendar_sync?: boolean
  google_block_busy?: boolean
  hours: Array<{ weekday: number; starts_at: string; ends_at: string }>
}
type ProviderAppointment = {
  id: string
  service_id: string
  service_name: string
  starts_at: string
  ends_at: string
  status: string
  attendee_user_id: string
  attendee_name: string | null
  attendee_email: string | null
}
type ProviderDashboard = {
  services: ProviderService[]
  appointments: ProviderAppointment[]
}

function weekdayLabel(value: number) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][value] || String(value)
}

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function serviceHostLabel(service: ProviderService) {
  if (service.host_type === 'individual' && service.host_user_name) return service.host_user_name
  if (service.host_type === 'org' && service.host_org_name) return service.host_org_name
  return 'Shared service'
}

export function ProviderSchedulingPage() {
  const { token } = useAuth()
  const [dashboard, setDashboard] = useState<ProviderDashboard>({ services: [], appointments: [] })
  const [hostOrganizations, setHostOrganizations] = useState<HostOrganization[]>([])
  const [googleCalendar, setGoogleCalendar] = useState<GoogleCalendarConnection | null>(null)
  const [publishHostType, setPublishHostType] = useState<'individual' | 'org'>('individual')
  const [publishHostOrgId, setPublishHostOrgId] = useState('')
  const [publishName, setPublishName] = useState('Half-hour session')
  const [publishDescription, setPublishDescription] = useState('Book a 30-minute session through the provider portal.')
  const [publishStartsAt, setPublishStartsAt] = useState('14:00')
  const [publishEndsAt, setPublishEndsAt] = useState('17:00')
  const [publishCapacity, setPublishCapacity] = useState('1')
  const [publishWeekdays, setPublishWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [publishGoogleCalendarSync, setPublishGoogleCalendarSync] = useState(false)
  const [publishGoogleBlockBusy, setPublishGoogleBlockBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function authenticatedFetch(path: string, init: RequestInit = {}) {
    if (!token) return new Response(JSON.stringify({ detail: 'Authentication required' }), { status: 401 })
    const send = (authToken: string) => {
      const headers = new Headers(init.headers)
      headers.set('Authorization', `Bearer ${authToken}`)
      return fetch(`${ORG_API_BASE}${path}`, { ...init, headers })
    }
    let response = await send(token)
    if (response.status === 401) {
      const refreshed = await refreshRuntimeTokenFromSession()
      if (refreshed) response = await send(refreshed)
    }
    return response
  }

  async function authenticatedPidpFetch(path: string, init: RequestInit = {}) {
    const send = async (authToken?: string) => {
      const headers = new Headers(init.headers)
      if (authToken) headers.set('Authorization', `Bearer ${authToken}`)
      return fetch(pidpUrl(path), { ...init, headers, credentials: 'include' })
    }
    let response = await send(token || undefined)
    if (response.status === 401) {
      const refreshed = await refreshRuntimeTokenFromSession()
      if (refreshed) response = await send(refreshed)
    }
    return response
  }

  async function responseDetail(response: Response, fallback: string) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string }
    return body.detail || fallback
  }

  async function loadDashboard() {
    const response = await authenticatedFetch('/api/health-insurance/provider')
    if (!response.ok) throw new Error(await responseDetail(response, 'Unable to load provider scheduling data.'))
    const data = (await response.json()) as ProviderDashboard
    setDashboard({
      services: Array.isArray(data.services) ? data.services : [],
      appointments: Array.isArray(data.appointments) ? data.appointments : [],
    })
  }

  async function loadHostOrganizations() {
    const response = await authenticatedFetch('/api/network/orgs?mine=true&limit=300')
    if (!response.ok) throw new Error(await responseDetail(response, 'Unable to load organizations.'))
    const data = (await response.json()) as HostOrganization[] | Record<string, unknown>
    setHostOrganizations((Array.isArray(data) ? data : []).filter((org) => org.my_role === 'owner' || org.my_role === 'administrator'))
  }

  async function loadGoogleCalendar() {
    const response = await authenticatedPidpFetch('/auth/google-calendar')
    if (!response.ok) throw new Error(await responseDetail(response, 'Unable to load Google Calendar connection.'))
    setGoogleCalendar((await response.json()) as GoogleCalendarConnection)
  }

  useEffect(() => {
    Promise.all([loadDashboard(), loadHostOrganizations(), loadGoogleCalendar()])
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load provider scheduling.'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (publishHostType === 'org') {
      setPublishGoogleCalendarSync(false)
      setPublishGoogleBlockBusy(false)
    }
  }, [publishHostType])

  async function publishService(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const response = await authenticatedFetch('/api/health-insurance/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host_type: publishHostType,
          host_org_id: publishHostType === 'org' ? publishHostOrgId : null,
          name: publishName,
          description: publishDescription,
          timezone: 'UTC',
          slot_minutes: 30,
          capacity_per_slot: Number(publishCapacity),
          weekdays: publishWeekdays,
          starts_at: publishStartsAt,
          ends_at: publishEndsAt,
          google_calendar_sync: publishGoogleCalendarSync,
          google_block_busy: publishGoogleBlockBusy,
        }),
      })
      if (!response.ok) throw new Error(await responseDetail(response, 'Unable to publish appointment calendar.'))
      await loadDashboard()
      await loadGoogleCalendar()
      setMessage('Recurring appointment calendar published.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to publish appointment calendar.')
    } finally {
      setSubmitting(false)
    }
  }

  async function disconnectGoogleCalendar() {
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const response = await authenticatedPidpFetch('/auth/google-calendar', { method: 'DELETE' })
      if (!response.ok) throw new Error(await responseDetail(response, 'Unable to disconnect Google Calendar.'))
      await loadGoogleCalendar()
      await loadDashboard()
      setPublishGoogleCalendarSync(false)
      setPublishGoogleBlockBusy(false)
      setMessage('Google Calendar disconnected.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to disconnect Google Calendar.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <main className="health-insurance-page"><p>Loading provider scheduling…</p></main>

  return (
    <main className="health-insurance-page">
      <section className="portal-hero health-insurance-hero">
        <div>
          <span className="health-insurance-eyebrow">Provider portal</span>
          <h1>Provider scheduling</h1>
          <p>Connect Google Calendar, publish recurring weekday availability after 14:00 UTC, and review bookings created through the portal.</p>
        </div>
      </section>

      {error ? <div className="health-insurance-alert error" role="alert">{error}</div> : null}
      {message ? <div className="health-insurance-alert success" role="status">{message}</div> : null}

      <section className="portal-card health-insurance-calendar">
        <div className="health-insurance-calendar-copy">
          <span className="health-insurance-eyebrow">Google sync</span>
          <h2>Connect Google Calendar</h2>
          <p>
            {googleCalendar?.connected
              ? `Connected as ${googleCalendar.google_email || 'Google account'}.`
              : 'Authorize Google Calendar to publish your recurring availability and create calendar events when portal slots are booked.'}
          </p>
          <p>Busy-time blocking is optional and currently applies only to individual-hosted calendars.</p>
          {googleCalendar?.connected ? (
            <button type="button" className="portal-button-secondary" onClick={() => void disconnectGoogleCalendar()} disabled={submitting}>
              Disconnect Google Calendar
            </button>
          ) : (
            <a
              className="portal-button-secondary"
              href={pidpUrl(`/auth/google-calendar/connect?next=${encodeURIComponent(window.location.href)}`)}
            >
              Connect Google Calendar
            </a>
          )}
        </div>
        <form className="portal-form health-insurance-scheduler" onSubmit={publishService}>
          <label>Host calendar<select value={publishHostType} onChange={(event) => setPublishHostType(event.target.value as 'individual' | 'org')}>
            <option value="individual">My calendar</option>
            <option value="org">Organization calendar</option>
          </select></label>
          {publishHostType === 'org' ? (
            <label>Organization<select value={publishHostOrgId} onChange={(event) => setPublishHostOrgId(event.target.value)} required>
              <option value="">Select an organization</option>
              {hostOrganizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select></label>
          ) : null}
          <label>Session title<input value={publishName} onChange={(event) => setPublishName(event.target.value)} required /></label>
          <label>Description<textarea value={publishDescription} onChange={(event) => setPublishDescription(event.target.value)} rows={4} required /></label>
          <div className="health-insurance-fields">
            <label>Starts at (UTC)<input type="time" value={publishStartsAt} onChange={(event) => setPublishStartsAt(event.target.value)} required /></label>
            <label>Ends at (UTC)<input type="time" value={publishEndsAt} onChange={(event) => setPublishEndsAt(event.target.value)} required /></label>
            <label>Capacity per slot<input type="number" min="1" max="100" value={publishCapacity} onChange={(event) => setPublishCapacity(event.target.value)} required /></label>
          </div>
          <div className="health-insurance-selector">
            <strong>Weekdays</strong>
            <div className="health-insurance-chip-list">
              {[1, 2, 3, 4, 5].map((weekday) => {
                const selected = publishWeekdays.includes(weekday)
                return (
                  <button
                    key={weekday}
                    type="button"
                    className="health-insurance-chip"
                    aria-pressed={selected}
                    onClick={() => setPublishWeekdays((current) => selected ? current.filter((value) => value !== weekday) : [...current, weekday].sort((left, right) => left - right))}
                  >
                    <strong>{weekdayLabel(weekday)}</strong>
                    <span>{selected ? 'Included' : 'Excluded'}</span>
                  </button>
                )
              })}
            </div>
          </div>
          {publishHostType === 'individual' ? (
            <>
              <label className="health-insurance-check">
                <input
                  type="checkbox"
                  checked={publishGoogleCalendarSync}
                  onChange={(event) => {
                    setPublishGoogleCalendarSync(event.target.checked)
                    if (!event.target.checked) setPublishGoogleBlockBusy(false)
                  }}
                  disabled={!googleCalendar?.connected}
                />
                <span>Publish this recurring availability to my Google Calendar.</span>
              </label>
              <label className="health-insurance-check">
                <input
                  type="checkbox"
                  checked={publishGoogleBlockBusy}
                  onChange={(event) => setPublishGoogleBlockBusy(event.target.checked)}
                  disabled={!publishGoogleCalendarSync}
                />
                <span>Block portal slots that conflict with my Google busy times.</span>
              </label>
              {!googleCalendar?.connected ? <small>Connect Google Calendar first to enable sync for individual-hosted services.</small> : null}
            </>
          ) : <small>Google Calendar sync is currently available only for individual-hosted services.</small>}
          <button type="submit" disabled={submitting || (publishHostType === 'org' && !publishHostOrgId) || !publishWeekdays.length}>
            {submitting ? 'Publishing…' : 'Publish recurring session calendar'}
          </button>
        </form>
      </section>

      <section className="portal-card health-insurance-calendar">
        <div className="health-insurance-calendar-copy">
          <span className="health-insurance-eyebrow">Published availability</span>
          <h2>Your calendars</h2>
          <p>Each published service accepts 30-minute bookings through the portal. Google event creation runs automatically when a member books a slot.</p>
        </div>
        <div className="health-insurance-appointments">
          {dashboard.services.length ? dashboard.services.map((service) => (
            <article key={service.id}>
              <div>
                <strong>{service.name}</strong>
                <span>{service.description}</span>
                <small>{serviceHostLabel(service)} · {service.hours.map((hour) => `${weekdayLabel(hour.weekday)} ${hour.starts_at}-${hour.ends_at}`).join(', ')} {service.timezone}</small>
              </div>
              <div>
                <span>{service.google_calendar_sync ? 'Google sync on' : 'Portal only'}</span>
                {service.google_block_busy ? <span>Busy-time blocking on</span> : null}
              </div>
            </article>
          )) : <p>No calendars published yet.</p>}
        </div>
      </section>

      <section className="portal-card health-insurance-history">
        <div>
          <span className="health-insurance-eyebrow">Portal bookings</span>
          <h2>Booked sessions</h2>
        </div>
        <div className="health-insurance-appointments">
          {dashboard.appointments.length ? dashboard.appointments.map((appointment) => (
            <article key={appointment.id}>
              <div>
                <strong>{appointment.service_name}</strong>
                <span>{new Date(appointment.starts_at).toLocaleString()} to {new Date(appointment.ends_at).toLocaleTimeString()}</span>
                <small>{appointment.attendee_name || 'Member'} · {appointment.attendee_email || 'No email on file'}</small>
              </div>
              <div>
                <span>{label(appointment.status)}</span>
              </div>
            </article>
          )) : <p>No portal bookings yet.</p>}
        </div>
      </section>
    </main>
  )
}
