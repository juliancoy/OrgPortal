import { afterEach, describe, expect, it, vi } from 'vitest'
import { bootstrapMatrixSessionFromOrg } from './bootstrapSession'
import { clearMatrixSession, loadMatrixSession } from './matrixSession'

describe('bootstrapMatrixSessionFromOrg', () => {
  const storage = new Map<string, string>()

  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      storage.delete(key)
    },
  })

  afterEach(() => {
    vi.restoreAllMocks()
    storage.clear()
    clearMatrixSession()
  })

  it('stores matrix session from org bootstrap response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          access_token: 'mx_access',
          user_id: '@org-user:matrix.local',
          device_id: 'DEVICE1',
        }),
      })),
    )

    const session = await bootstrapMatrixSessionFromOrg('org-token')
    expect(session.accessToken).toBe('mx_access')
    expect(session.userId).toBe('@org-user:matrix.local')
    expect(loadMatrixSession()?.accessToken).toBe('mx_access')
  })

  it('throws if bootstrap fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        text: async () => 'Matrix bootstrap unavailable',
      })),
    )
    await expect(bootstrapMatrixSessionFromOrg('org-token')).rejects.toThrow('Matrix bootstrap unavailable')
  })
})
