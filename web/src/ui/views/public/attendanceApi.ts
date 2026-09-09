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

async function attendanceRequest(eventId: string, token: string | null, method: string): Promise<Response> {
  return fetch(orgUrl(`/api/network/events/${encodeURIComponent(eventId)}/attendance`), {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
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

export async function recordAttendanceWithRetry(eventId: string, token: string | null, method: 'POST' | 'DELETE' = 'POST'): Promise<AttendanceResult> {
  if (!token) {
    const refreshed = await refreshRuntimeTokenFromSession()
    if (!refreshed) {
      return { ok: false, message: 'Please log in or sign up to register.' }
    }
    token = refreshed
  }

  let resp = await attendanceRequest(eventId, token, method)
  if (resp.status === 401) {
    const refreshed = await refreshRuntimeTokenFromSession()
    if (refreshed) {
      resp = await attendanceRequest(eventId, refreshed, method)
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
