import { describe, expect, it, vi } from 'vitest'
import type { ChatService } from '../application/ports/ChatService'
import { LazyChatService } from './LazyChatService'

describe('LazyChatService', () => {
  it('loads chat only when started and reuses the loaded service', async () => {
    const client = {}
    const underlying = { start: vi.fn().mockResolvedValue(client), stop: vi.fn(), getClient: () => client } as unknown as ChatService
    const load = vi.fn().mockResolvedValue(underlying)
    const service = new LazyChatService(load)
    service.stop()
    expect(service.listJoinedRooms()).toEqual([])
    expect(load).not.toHaveBeenCalled()
    const session = { accessToken: 'test', userId: '@test:example.com' }
    expect(await service.start(session)).toBe(client)
    service.stop()
    expect(await service.start(session)).toBe(client)
    expect(load).toHaveBeenCalledTimes(1)
    expect(service.getClient()).toBe(client)
    expect(underlying.stop).toHaveBeenCalledTimes(1)
  })

  it('allows retry after the chat bundle fails to load', async () => {
    const underlying = { start: vi.fn().mockResolvedValue({}) } as unknown as ChatService
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(underlying)
    const service = new LazyChatService(load)
    const session = { accessToken: 'test', userId: '@test:example.com' }
    await expect(service.start(session)).rejects.toThrow('offline')
    await service.start(session)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
