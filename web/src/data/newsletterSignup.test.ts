import { afterEach, expect, it, vi } from 'vitest'
import { subscribeToNewsletter } from './newsletterSignup'
afterEach(() => vi.unstubAllGlobals())
it('sends explicit consent to the selected organization without account credentials', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({message: 'Thank you'}))
  vi.stubGlobal('fetch', fetch)
  expect(await subscribeToNewsletter('one/two', 'person@example.test')).toBe('Thank you')
  const [url, request] = fetch.mock.calls[0]
  expect(url).toBe('/api/org/api/email/newsletter/one%2Ftwo')
  expect(request.credentials).toBe('omit')
  expect(request.headers.Authorization).toBeUndefined()
  expect(JSON.parse(request.body)).toEqual({email: 'person@example.test', consent: true})
})
it('exposes retryable failures and requires server confirmation before reporting success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({detail:'Please wait'}, {status:429})).mockResolvedValueOnce(Response.json({})))
  await expect(subscribeToNewsletter('one', 'person@example.test')).rejects.toThrow('Please wait')
  await expect(subscribeToNewsletter('one', 'person@example.test')).rejects.toThrow('confirm signup')
})
