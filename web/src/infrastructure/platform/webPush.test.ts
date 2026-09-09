import { afterEach, describe, expect, it, vi } from 'vitest'
import { disableWebPush, urlBase64ToBytes } from './webPush'

describe('Web Push application server keys', () => {
  it('decodes URL-safe base64 without padding', () => {
    expect(Array.from(urlBase64ToBytes('AQID-_8'))).toEqual([1, 2, 3, 251, 255])
  })
})

afterEach(() => vi.unstubAllGlobals())
it('disabling alerts affects only the current browser, leaving other devices subscribed', async () => {
  const unsubscribe = vi.fn().mockResolvedValue(true)
  const removeItem = vi.fn()
  vi.stubGlobal('window', { PushManager: function () {}, Notification: {}, location: { origin: 'https://codecollective.us' } })
  vi.stubGlobal('PushManager', function () {})
  vi.stubGlobal('Notification', {})
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => ({ unsubscribe }) } }) } })
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ id: 'this-browser', gatewayUrl: '/push' }), removeItem })
  const fetchMock = vi.fn().mockImplementation(async (_url, options) => Response.json(options?.method === 'DELETE' ? {} : { subscription_ids: ['this-browser', 'other-phone'] }))
  vi.stubGlobal('fetch', fetchMock)
  await disableWebPush('token')
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'DELETE').map(([url]) => url)).toEqual(['/api/org/api/network/push/subscriptions/this-browser'])
  expect(unsubscribe).toHaveBeenCalledOnce()
  expect(removeItem).toHaveBeenCalled()
})
