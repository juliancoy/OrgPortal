import { expect, test, vi } from 'vitest'
import { installChunkRecovery } from './chunkRecovery'

test('refreshes a stale tab once and lets repeated failures reach the error screen', () => {
  const target = new EventTarget()
  const storage = new Map<string, string>()
  const reload = vi.fn()
  Object.assign(target, {
    location: { pathname: '/ecosystem/network', reload },
    sessionStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) },
  })
  const cleanup = installChunkRecovery(target as unknown as Window, 'release-1')
  const first = new Event('vite:preloadError', { cancelable: true })
  target.dispatchEvent(first)
  expect(first.defaultPrevented).toBe(true)
  cleanup()
  installChunkRecovery(target as unknown as Window, 'release-1')
  const repeated = new Event('vite:preloadError', { cancelable: true })
  target.dispatchEvent(repeated)
  expect(repeated.defaultPrevented).toBe(false)
  expect(reload).toHaveBeenCalledTimes(1)
})

test('does not refresh when storage cannot guard against loops', () => {
  const target = new EventTarget()
  const reload = vi.fn()
  Object.assign(target, { location: { pathname: '/', reload }, sessionStorage: { getItem: () => { throw new Error('Storage blocked') } } })
  installChunkRecovery(target as unknown as Window, 'release-1')
  target.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))
  expect(reload).not.toHaveBeenCalled()
})
