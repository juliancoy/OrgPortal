import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeChatApi } from './nativeChatApi'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NativeChatApi', () => {
  it('defaults to the same-origin chat proxy', async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ conversations: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetcher)
    const api = new NativeChatApi(async () => 'test-token')

    await api.listConversations()

    expect(fetcher.mock.calls[0][0]).toBe('/api/chat/api/network/chat/conversations')
  })

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

  it('surfaces plain text chat failures without a JSON parse error', async () => {
    const fetcher = vi.fn(async () => new Response('Internal Server Error', { status: 500 }))
    vi.stubGlobal('fetch', fetcher)
    const api = new NativeChatApi(async () => 'test-token', 'https://chat.example.test')

    await expect(api.startEventRoom({ eventId: 'event-1', title: 'MedTech in the Hut Comments' })).rejects.toThrow('Internal Server Error')
  })

  it('starts event rooms and sends threaded comments with reactions', async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/event-room')) {
        return new Response(
          JSON.stringify({ conversation: { id: 'event-room-1', kind: 'event_room', event_id: 'event-1', updated_at: '2026-09-09T22:00:00Z' } }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.endsWith('/messages/root-message/reactions')) {
        return new Response(JSON.stringify({ reactions: [{ key: '👍', count: 1 }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({
          message: {
            id: 'reply-message',
            conversation_id: 'event-room-1',
            body: 'Same here.',
            reply_to_message_id: 'root-message',
            thread_root_message_id: 'root-message',
            created_at: '2026-09-09T22:01:00Z',
          },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetcher)
    const api = new NativeChatApi(async () => 'test-token', 'https://chat.example.test')

    const conversation = await api.startEventRoom({ eventId: 'event-1', title: 'MedTech in the Hut Comments', orgId: 'org-baltimore-medtech' })
    const reply = await api.sendMessage('event-room-1', 'client-reply', 'Same here.', {
      replyToMessageId: 'root-message',
      threadRootMessageId: 'root-message',
    })
    const reactions = await api.sendReaction('event-room-1', 'root-message', '👍')

    expect(conversation.id).toBe('event-room-1')
    expect(reply.thread_root_message_id).toBe('root-message')
    expect(reactions).toEqual([{ key: '👍', count: 1 }])
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      event_id: 'event-1',
      title: 'MedTech in the Hut Comments',
      org_id: 'org-baltimore-medtech',
    })
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({
      client_message_id: 'client-reply',
      body: 'Same here.',
      reply_to_message_id: 'root-message',
      thread_root_message_id: 'root-message',
    })
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({ emoji: '👍' })
  })
})
