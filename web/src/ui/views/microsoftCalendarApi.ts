import { pidpUrl } from '../../config/pidp'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'

export type MicrosoftCalendarConnection = {
  connected: boolean
  microsoft_email: string | null
  calendar_id: string | null
  updated_at: string | null
}

export type MicrosoftCalendarListItem = {
  id: string
  summary: string
  description: string | null
  location: string | null
  web_link: string | null
  starts_at: string | null
  ends_at: string | null
}

export type SavePortalEventMicrosoftCalendarInput = {
  external_event_id: string
  summary: string
  description: string
  starts_at: string
  ends_at: string
  location?: string | null
  source_url?: string | null
}

async function authenticatedPidpFetch(token: string | null, path: string, init: RequestInit = {}) {
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

export async function loadMicrosoftCalendarConnection(token: string | null) {
  const response = await authenticatedPidpFetch(token, '/auth/microsoft-calendar')
  if (!response.ok) throw new Error(await responseDetail(response, 'Unable to load Microsoft Calendar connection.'))
  return (await response.json()) as MicrosoftCalendarConnection
}

export async function loadUpcomingMicrosoftCalendarEvents(token: string | null, limit = 12) {
  const response = await authenticatedPidpFetch(token, `/auth/microsoft-calendar/events?limit=${encodeURIComponent(String(limit))}`)
  if (!response.ok) throw new Error(await responseDetail(response, 'Unable to load Microsoft Calendar events.'))
  return (await response.json()) as { connected: boolean; calendar_id: string | null; events: MicrosoftCalendarListItem[] }
}

export async function savePortalEventToMicrosoftCalendar(token: string | null, input: SavePortalEventMicrosoftCalendarInput) {
  const response = await authenticatedPidpFetch(token, '/auth/microsoft-calendar/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await responseDetail(response, 'Unable to add this event to Microsoft Calendar.'))
  return (await response.json()) as { connected: boolean; event_id: string | null; web_link: string | null }
}

export async function disconnectMicrosoftCalendarConnection(token: string | null) {
  const response = await authenticatedPidpFetch(token, '/auth/microsoft-calendar', { method: 'DELETE' })
  if (!response.ok) throw new Error(await responseDetail(response, 'Unable to disconnect Microsoft Calendar.'))
  return response.json()
}
