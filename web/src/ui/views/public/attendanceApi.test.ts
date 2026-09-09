import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadAttendance, recordAttendanceWithRetry } from './attendanceApi'
import { refreshRuntimeTokenFromSession } from '../../../infrastructure/auth/sessionToken'

vi.mock('../../../infrastructure/auth/sessionToken', () => ({ refreshRuntimeTokenFromSession: vi.fn() }))
const attendance = { event_id: 'one', count: 1, registered: true, attendees: [] }
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })

describe('event registration API', () => {
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
  it('refreshes an expired token and returns the authoritative count', async () => {
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
})
