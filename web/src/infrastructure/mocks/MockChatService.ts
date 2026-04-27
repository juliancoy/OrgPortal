import { type MatrixClient } from 'matrix-js-sdk'
import type { ChatMessage, ChatRoomSummary, ChatService, ChatSession } from '../../application/ports/ChatService'

type MutableRoom = {
  id: string
  name: string
  public: boolean
  unreadCount: number
  lastActivityTs: number
}

export class MockChatService implements ChatService {
  private started = false
  private joinedRooms: MutableRoom[] = [
    { id: '!org-general:mock.local', name: 'Org General', public: true, unreadCount: 1, lastActivityTs: Date.now() - 1000 * 60 * 5 },
    { id: '!org-admin:mock.local', name: 'Org Admin', public: false, unreadCount: 0, lastActivityTs: Date.now() - 1000 * 60 * 30 },
  ]
  private publicRooms: MutableRoom[] = [
    { id: '!org-events:mock.local', name: 'Org Events', public: true, unreadCount: 0, lastActivityTs: Date.now() - 1000 * 60 * 60 },
    { id: '!org-community:mock.local', name: 'Org Community', public: true, unreadCount: 0, lastActivityTs: Date.now() - 1000 * 60 * 90 },
  ]
  private messages = new Map<string, ChatMessage[]>()
  private session: ChatSession | null = null

  constructor() {
    this.messages.set('!org-general:mock.local', [
      {
        id: 'evt_1',
        sender: '@system:mock.local',
        body: 'Welcome to Org General.',
        ts: Date.now() - 1000 * 60 * 15,
      },
      {
        id: 'evt_2',
        sender: '@member:mock.local',
        body: 'Hello everyone.',
        ts: Date.now() - 1000 * 60 * 5,
      },
    ])
    this.messages.set('!org-admin:mock.local', [
      {
        id: 'evt_3',
        sender: '@sysadmin:mock.local',
        body: 'Admin room initialized.',
        ts: Date.now() - 1000 * 60 * 30,
      },
    ])
  }

  async start(session: ChatSession): Promise<MatrixClient> {
    this.session = session
    this.started = true
    return this.getClient()
  }

  stop(): void {
    this.started = false
  }

  getClient(): MatrixClient {
    if (!this.started || !this.session) {
      throw new Error('Mock chat service is not initialized')
    }
    return {
      getUserId: () => this.session?.userId ?? null,
    } as MatrixClient
  }

  async verifySession(): Promise<void> {
    if (!this.started || !this.session?.accessToken) {
      throw new Error('No active mock session')
    }
  }

  listJoinedRooms(): ChatRoomSummary[] {
    return this.joinedRooms.map((room) => ({
      id: room.id,
      name: room.name,
      unreadCount: room.unreadCount,
      lastActivityTs: room.lastActivityTs,
    }))
  }

  async listPublicRooms(limit = 50): Promise<ChatRoomSummary[]> {
    return this.publicRooms.slice(0, limit).map((room) => ({
      id: room.id,
      name: room.name,
      unreadCount: 0,
      lastActivityTs: room.lastActivityTs,
    }))
  }

  async joinRoom(roomId: string): Promise<void> {
    const found = this.publicRooms.find((room) => room.id === roomId)
    if (!found) return
    if (!this.joinedRooms.some((room) => room.id === roomId)) {
      this.joinedRooms.push({ ...found, unreadCount: 0, lastActivityTs: Date.now() })
    }
    this.publicRooms = this.publicRooms.filter((room) => room.id !== roomId)
  }

  listMessages(roomId: string): ChatMessage[] {
    return (this.messages.get(roomId) ?? []).slice().sort((a, b) => a.ts - b.ts)
  }

  async sendTextMessage(roomId: string, body: string): Promise<void> {
    const text = body.trim()
    if (!text) return
    const next: ChatMessage = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sender: this.session?.userId ?? '@unknown:mock.local',
      body: text,
      ts: Date.now(),
    }
    const current = this.messages.get(roomId) ?? []
    current.push(next)
    this.messages.set(roomId, current)
    const joined = this.joinedRooms.find((room) => room.id === roomId)
    if (joined) {
      joined.lastActivityTs = next.ts
    }
  }

  async sendReaction(roomId: string, eventId: string, key: string): Promise<void> {
    const current = this.messages.get(roomId) ?? []
    const target = current.find((message) => message.id === eventId)
    if (!target) return
    const existing = target.reactions ?? []
    const found = existing.find((reaction) => reaction.key === key)
    if (found) {
      found.count += 1
    } else {
      existing.push({ key, count: 1 })
    }
    target.reactions = existing
    this.messages.set(roomId, current)
  }

  async sendMediaMessage(roomId: string, file: File): Promise<void> {
    const isImage = file.type.startsWith('image/')
    const next: ChatMessage = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sender: this.session?.userId ?? '@unknown:mock.local',
      body: file.name,
      ts: Date.now(),
      messageType: isImage ? 'image' : 'file',
      mediaFileName: file.name,
      mediaMimeType: file.type || 'application/octet-stream',
      mediaUrl: isImage ? `mock://media/${encodeURIComponent(file.name)}` : undefined,
    }
    const current = this.messages.get(roomId) ?? []
    current.push(next)
    this.messages.set(roomId, current)
    const joined = this.joinedRooms.find((room) => room.id === roomId)
    if (joined) {
      joined.lastActivityTs = next.ts
    }
  }

  async sendReplyMessage(roomId: string, eventId: string, body: string): Promise<void> {
    const text = body.trim()
    if (!text) return
    const next: ChatMessage = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sender: this.session?.userId ?? '@unknown:mock.local',
      body: text,
      ts: Date.now(),
      replyToEventId: eventId,
    }
    const current = this.messages.get(roomId) ?? []
    current.push(next)
    this.messages.set(roomId, current)
  }

  async sendThreadReplyMessage(roomId: string, threadRootEventId: string, parentEventId: string, body: string): Promise<void> {
    const text = body.trim()
    if (!text) return
    const next: ChatMessage = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sender: this.session?.userId ?? '@unknown:mock.local',
      body: text,
      ts: Date.now(),
      replyToEventId: parentEventId,
      threadRootEventId,
    }
    const current = this.messages.get(roomId) ?? []
    current.push(next)
    this.messages.set(roomId, current)
  }

  async editMessage(roomId: string, eventId: string, body: string): Promise<void> {
    const text = body.trim()
    if (!text) return
    const current = this.messages.get(roomId) ?? []
    const target = current.find((message) => message.id === eventId)
    if (!target) return
    target.body = text
    target.edited = true
    target.ts = Date.now()
    this.messages.set(roomId, current)
  }

  async deleteMessage(roomId: string, eventId: string): Promise<void> {
    const current = this.messages.get(roomId) ?? []
    this.messages.set(
      roomId,
      current.filter((message) => message.id !== eventId),
    )
  }
}
