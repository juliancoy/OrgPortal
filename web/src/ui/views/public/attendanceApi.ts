import { refreshRuntimeTokenFromSession } from '../../../infrastructure/auth/sessionToken'

const ORG_API_BASE = '/api/org'

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

type AttendanceResult = {
  ok: boolean
  message: string
}

async function postAttendance(eventId: string, token: string): Promise<Response> {
  return fetch(orgUrl(`/api/network/events/${eventId}/attendance`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  })
}

export async function recordAttendanceWithRetry(eventId: string, token: string | null): Promise<AttendanceResult> {
  if (!token) {
    const refreshed = await refreshRuntimeTokenFromSession()
    if (!refreshed) {
      return { ok: false, message: 'Please log in to indicate attendance.' }
    }
    token = refreshed
  }

  let resp = await postAttendance(eventId, token)
  if (resp.status === 401) {
    const refreshed = await refreshRuntimeTokenFromSession()
    if (refreshed) {
      resp = await postAttendance(eventId, refreshed)
    }
  }

  if (resp.ok) {
    return { ok: true, message: 'Attendance recorded.' }
  }

  const text = await resp.text().catch(() => '')
  if (resp.status === 401) {
    return { ok: false, message: 'Session expired. Please log in again.' }
  }
  return { ok: false, message: text || `Unable to record attendance (${resp.status})` }
}
