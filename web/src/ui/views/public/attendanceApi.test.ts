import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadAttendance,
  loadRegisteredEventsCalendarFeed,
  recordAttendanceWithRetry,
  regenerateRegisteredEventsCalendarFeed,
} from './attendanceApi'
import { refreshRuntimeTokenFromSession } from '../../../infrastructure/auth/sessionToken'

vi.mock('../../../infrastructure/auth/sessionToken', () => ({ refreshRuntimeTokenFromSession: vi.fn() }))
const attendance = { event_id: 'one', count: 1, registered: true, attendees: [] }
const feed = {
  feed_url: 'https://medtech.social/api/org/api/network/calendar/feed/private.ics',
  download_url: 'https://medtech.social/api/org/api/network/calendar/feed/private.ics',
  webcal_url: 'webcal://medtech.social/api/org/api/network/calendar/feed/private.ics',
  google_url: 'https://calendar.google.com/calendar/r?cid=feed',
  outlook_url: 'https://outlook.live.com/calendar/0/addfromweb?url=feed',
  event_count: 2,
  token_created_at: '2026-09-09T21:00:00.000Z',
}
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })

describe('event registration API', () => {
  it('submits the event and organization email choices separately', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(attendance))
    vi.stubGlobal('fetch', fetch)
    await recordAttendanceWithRetry('one', 'token', 'POST', { email_updates: true, organization_announcements: false })
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ email_updates: true, organization_announcements: false })
  })
  it('loads the saved registration state without caching', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(attendance))
    vi.stubGlobal('fetch', fetch)
    expect(await loadAttendance('one', 'token')).toEqual(attendance)
    expect(fetch).toHaveBeenCalledWith('/api/org/api/network/events/one/attendance', expect.objectContaining({
      method: 'GET', cache: 'no-store', headers: { Authorization: 'Bearer token' },
    }))
  })
  it('does not submit a registration without a signed-in session', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    vi.mocked(refreshRuntimeTokenFromSession).mockResolvedValue(null)
    expect((await recordAttendanceWithRetry('one', null)).ok).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('refreshes an expired token and returns the privacy-safe public count', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 })).mockResolvedValueOnce(Response.json(attendance))
    vi.stubGlobal('fetch', fetch)
    vi.mocked(refreshRuntimeTokenFromSession).mockResolvedValue('fresh')
    expect((await recordAttendanceWithRetry('one', 'expired')).attendance).toEqual(attendance)
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh')
  })
  it('cancels using DELETE and shows a useful error when saving fails', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ...attendance, count: 0, registered: false }))
      .mockResolvedValueOnce(new Response('internal details', { status: 500 }))
    vi.stubGlobal('fetch', fetch)
    expect((await recordAttendanceWithRetry('one', 'token', 'DELETE')).attendance?.registered).toBe(false)
    expect(fetch.mock.calls[0][1].method).toBe('DELETE')
    const result = await recordAttendanceWithRetry('one', 'token')
    expect(result.ok).toBe(false)
    expect(result.message).not.toContain('internal details')
  })
  it('loads the registered events subscription feed metadata', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(feed))
    vi.stubGlobal('fetch', fetch)
    expect(await loadRegisteredEventsCalendarFeed('token')).toEqual(feed)
    expect(fetch).toHaveBeenCalledWith('/api/org/api/network/calendar/feed', expect.objectContaining({
      method: 'GET', cache: 'no-store', headers: { Authorization: 'Bearer token' },
    }))
  })
  it('regenerates the registered events subscription feed with refreshed auth', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 })).mockResolvedValueOnce(Response.json(feed))
    vi.stubGlobal('fetch', fetch)
    vi.mocked(refreshRuntimeTokenFromSession).mockResolvedValue('fresh')
    expect(await regenerateRegisteredEventsCalendarFeed('expired')).toEqual(feed)
    expect(fetch.mock.calls[0][0]).toBe('/api/org/api/network/calendar/feed/regenerate')
    expect(fetch.mock.calls[0][1].method).toBe('POST')
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh')
  })
})
