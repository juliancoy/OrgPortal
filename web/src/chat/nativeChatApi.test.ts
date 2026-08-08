import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeChatApi } from './nativeChatApi'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NativeChatApi', () => {
  it('starts a DM by stable user ID without requiring a public profile slug', async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          conversation: { id: 'dm-1', kind: 'dm', updated_at: '2026-08-07T00:00:00Z' },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetcher)
    const api = new NativeChatApi(async () => 'test-token', 'https://chat.example.test')

    const conversation = await api.startDm({ userId: 'user-2', userName: 'Private Person' })

    expect(conversation.id).toBe('dm-1')
    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('https://chat.example.test/api/network/chat/dm')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      target_user_id: 'user-2',
      target_user_name: 'Private Person',
    })
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token')
  })

  it('heartbeats and reads presence for unique user IDs', async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ online: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      const requestedIds = new URL(url).searchParams.get('user_ids')?.split(',') || []
      return new Response(
        JSON.stringify({ presence: requestedIds.map((user_id) => ({ user_id, online: user_id === 'user-2' })) }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetcher)
    const api = new NativeChatApi(async () => 'test-token', 'https://chat.example.test')

    await api.heartbeatPresence()
    const presence = await api.getPresence(['user-2', 'user-3', 'user-2'])

    expect(presence).toEqual([
      { user_id: 'user-2', online: true },
      { user_id: 'user-3', online: false },
    ])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0][0]).toBe('https://chat.example.test/api/network/chat/presence')
    expect(fetcher.mock.calls[0][1]?.method).toBe('POST')
    expect(fetcher.mock.calls[1][0]).toBe('https://chat.example.test/api/network/chat/presence?user_ids=user-2%2Cuser-3')
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer test-token')
  })
})
