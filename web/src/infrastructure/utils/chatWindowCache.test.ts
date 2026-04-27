import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../../application/ports/ChatService'
import {
  readCachedOrgChatFeed,
  readCachedRoomMessages,
  writeCachedOrgChatFeed,
  writeCachedRoomMessages,
} from './chatWindowCache'

function createStorage() {
  const map = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => map.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      map.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      map.delete(key)
    }),
    clear: vi.fn(() => {
      map.clear()
    }),
  }
}

describe('chatWindowCache', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.stubGlobal('localStorage', createStorage())
  })

  it('round-trips org chat feed payloads', () => {
    const payload = { organization_slug: 'alpha', rooms: [{ key: 'general', messages: [] }] }
    writeCachedOrgChatFeed('alpha', payload)
    expect(readCachedOrgChatFeed<typeof payload>('alpha')).toEqual(payload)
  })

  it('drops stale org chat feed entries after ttl', () => {
    vi.useFakeTimers()
    const payload = { organization_slug: 'alpha', rooms: [{ key: 'general', messages: [] }] }
    writeCachedOrgChatFeed('alpha', payload)
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    expect(readCachedOrgChatFeed<typeof payload>('alpha')).toBeNull()
  })

  it('sanitizes cached room messages', () => {
    const messages: ChatMessage[] = [
      { id: 'm1', sender: '@alice:matrix', body: 'hello', ts: 1 },
      { id: 'm2', sender: '@bob:matrix', body: 'world', ts: 2, reactions: [{ key: '👍', count: 2 }] },
    ]
    writeCachedRoomMessages('!room:matrix', messages)

    const cached = readCachedRoomMessages('!room:matrix')
    expect(cached).toHaveLength(2)
    expect(cached[0].id).toBe('m1')
    expect(cached[1].reactions?.[0].key).toBe('👍')
  })
})

