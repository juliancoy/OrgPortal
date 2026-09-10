import { refreshRuntimeTokenFromSession } from '../../../infrastructure/auth/sessionToken'

const ORG_API_BASE = '/api/org'

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

type AttendanceResult = {
  ok: boolean
  message: string
  attendance?: EventAttendance
}

export type EventAttendance = {
  event_id: string
  count: number
  registered: boolean
  attendees: { slug: string; name: string; photo_url: string | null }[]
}

export type RegisteredEventsCalendarFeed = {
  feed_url: string
  download_url: string
  webcal_url: string
  google_url: string
  outlook_url: string
  event_count: number
  token_created_at: string
}

type EmailChoices = { email_updates: boolean; organization_announcements: boolean }
async function attendanceRequest(eventId: string, token: string | null, method: string, emailChoices?: EmailChoices): Promise<Response> {
  return fetch(orgUrl(`/api/network/events/${encodeURIComponent(eventId)}/attendance`), {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(emailChoices ? { 'Content-Type': 'application/json' } : {}) },
    body: method === 'POST' && emailChoices ? JSON.stringify(emailChoices) : undefined,
    credentials: 'include',
    cache: 'no-store',
  })
}

export async function loadAttendance(eventId: string, token: string | null): Promise<EventAttendance> {
  let response = await attendanceRequest(eventId, token, 'GET')
  if (response.status === 401 && token) {
    const refreshed = await refreshRuntimeTokenFromSession()
    if (refreshed) response = await attendanceRequest(eventId, refreshed, 'GET')
  }
  if (!response.ok) throw new Error(response.status === 401
    ? 'Session expired. Please log in again.' : 'Unable to load registrations. Please try again.')
  return response.json() as Promise<EventAttendance>
}

async function calendarFeedRequest(token: string | null, method: 'GET' | 'POST'): Promise<Response> {
  return fetch(orgUrl(method === 'POST' ? '/api/network/calendar/feed/regenerate' : '/api/network/calendar/feed'), {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: 'include',
    cache: 'no-store',
  })
}

export async function loadRegisteredEventsCalendarFeed(token: string | null): Promise<RegisteredEventsCalendarFeed> {
  let response = await calendarFeedRequest(token, 'GET')
  if (response.status === 401 && token) {
    const refreshed = await refreshRuntimeTokenFromSession()
    if (refreshed) response = await calendarFeedRequest(refreshed, 'GET')
  }
  if (!response.ok) throw new Error(response.status === 401
    ? 'Session expired. Please log in again.' : 'Unable to load registered events calendar.')
  return response.json() as Promise<RegisteredEventsCalendarFeed>
}

export async function regenerateRegisteredEventsCalendarFeed(token: string | null): Promise<RegisteredEventsCalendarFeed> {
  if (!token) {
    const refreshed = await refreshRuntimeTokenFromSession()
    if (!refreshed) throw new Error('Session expired. Please log in again.')
    token = refreshed
  }
  let response = await calendarFeedRequest(token, 'POST')
  if (response.status === 401) {
    const refreshed = await refreshRuntimeTokenFromSession()
    if (refreshed) response = await calendarFeedRequest(refreshed, 'POST')
  }
  if (!response.ok) throw new Error(response.status === 401
    ? 'Session expired. Please log in again.' : 'Unable to regenerate registered events calendar.')
  return response.json() as Promise<RegisteredEventsCalendarFeed>
}

export async function recordAttendanceWithRetry(eventId: string, token: string | null, method: 'POST' | 'DELETE' = 'POST', emailChoices?: EmailChoices): Promise<AttendanceResult> {
  if (!token) {
    const refreshed = await refreshRuntimeTokenFromSession()
    if (!refreshed) {
      return { ok: false, message: 'Please log in to register.' }
    }
    token = refreshed
  }

  let resp = await attendanceRequest(eventId, token, method, emailChoices)
  if (resp.status === 401) {
    const refreshed = await refreshRuntimeTokenFromSession()
    if (refreshed) {
      resp = await attendanceRequest(eventId, refreshed, method, emailChoices)
    }
  }

  if (resp.ok) {
    return { ok: true, message: method === 'DELETE' ? 'Registration cancelled.' : 'You’re registered!', attendance: await resp.json() as EventAttendance }
  }

  if (resp.status === 401) {
    return { ok: false, message: 'Session expired. Please log in again.' }
  }
  return { ok: false, message: 'Unable to save your registration. Please try again.' }
}
