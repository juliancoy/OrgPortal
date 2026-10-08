import { afterEach, expect, it, vi } from 'vitest'
import { emailApi } from './emailApi'
import { refreshRuntimeTokenFromSession } from '../../../infrastructure/auth/sessionToken'
vi.mock('../../../infrastructure/auth/sessionToken', () => ({ refreshRuntimeTokenFromSession: vi.fn() }))
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })

it('sends campaign authorization and approved fingerprint without caching', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ queued: true }))
  vi.stubGlobal('fetch', fetch)
  await emailApi('token', '/campaigns/campaign-1/send', 'POST', { fingerprint: 'approved-preview' })
  expect(fetch).toHaveBeenCalledOnce()
  expect(fetch).toHaveBeenCalledWith('/api/org/api/email/campaigns/campaign-1/send', expect.objectContaining({
    method: 'POST', credentials: 'include', cache: 'no-store', body: JSON.stringify({ fingerprint: 'approved-preview' }),
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
  }))
})
it('refreshes invalid identity before retrying a rejected request', async () => {
  vi.mocked(refreshRuntimeTokenFromSession).mockResolvedValue('fresh')
  const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 })).mockResolvedValueOnce(Response.json({ queued: true }))
  vi.stubGlobal('fetch', fetch)
  await emailApi('old', '/campaigns/campaign-1/test', 'POST')
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh')
})
it('never automatically repeats a send request after an ambiguous network failure', async () => {
  const fetch = vi.fn().mockRejectedValue(new Error('Connection lost'))
  vi.stubGlobal('fetch', fetch)
  await expect(emailApi('token', '/campaigns/campaign-1/send', 'POST')).rejects.toThrow('Connection lost')
  expect(fetch).toHaveBeenCalledOnce()
})
