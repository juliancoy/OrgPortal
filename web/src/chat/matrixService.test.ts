import { ClientEvent, EventType, MsgType, type MatrixClient } from 'matrix-js-sdk'
import { MatrixChatService } from './matrixService'

type SyncListener = (state: string) => void

class FakeMatrixClient {
  private syncListeners = new Set<SyncListener>()
  private rooms: any[] = []
  private roomMessages = new Map<string, any[]>()
  public redactions: Array<{ roomId: string; eventId: string }> = []
  public joinRateLimitRemaining = 0
  public sendRateLimitRemaining = 0
  public sendRetryAfterMs = 1

  constructor() {
    this.rooms = [
      {
        roomId: '!joined:matrix.local',
        name: 'Joined Room',
        getMyMembership: () => 'join',
        getUnreadNotificationCount: () => 2,
        getLiveTimeline: () => ({
          getEvents: () => this.roomMessages.get('!joined:matrix.local') ?? [],
        }),
      },
    ]
    this.roomMessages.set('!joined:matrix.local', [
      {
        getType: () => EventType.RoomMessage,
        getContent: () => ({ msgtype: MsgType.Text, body: 'seed' }),
        getId: () => 'evt_seed',
        getSender: () => '@alice:matrix.local',
        getTs: () => 10,
      },
    ])
  }

  on(event: string, listener: SyncListener) {
    if (event === ClientEvent.Sync) this.syncListeners.add(listener)
  }

  off(event: string, listener: SyncListener) {
    if (event === ClientEvent.Sync) this.syncListeners.delete(listener)
  }

  removeAllListeners() {
    this.syncListeners.clear()
  }

  startClient() {
    for (const listener of this.syncListeners) {
      listener('PREPARED')
    }
  }

  stopClient() {}

  whoami() {
    return Promise.resolve({ user_id: '@tester:matrix.local' })
  }

  getRooms() {
    return this.rooms
  }

  publicRooms() {
    return Promise.resolve({
      chunk: [{ room_id: '!public:matrix.local', name: 'Public Room' }],
    })
  }

  joinRoom(roomId: string) {
    if (this.joinRateLimitRemaining > 0) {
      this.joinRateLimitRemaining -= 1
      return Promise.reject({
        data: { errcode: 'M_LIMIT_EXCEEDED', retry_after_ms: 1 },
        httpStatus: 429,
      })
    }
    if (!this.rooms.some((room) => room.roomId === roomId)) {
      this.rooms.push({
        roomId,
        name: roomId,
        getMyMembership: () => 'join',
        getUnreadNotificationCount: () => 0,
        getLiveTimeline: () => ({
          getEvents: () => this.roomMessages.get(roomId) ?? [],
        }),
      })
    }
    return Promise.resolve({})
  }

  getRoom(roomId: string) {
    return this.rooms.find((room) => room.roomId === roomId) ?? null
  }

  sendTextMessage(roomId: string, body: string) {
    if (this.sendRateLimitRemaining > 0) {
      this.sendRateLimitRemaining -= 1
      return Promise.reject({
        data: { errcode: 'M_LIMIT_EXCEEDED', retry_after_ms: this.sendRetryAfterMs },
        httpStatus: 429,
      })
    }
    const events = this.roomMessages.get(roomId) ?? []
    events.push({
      getType: () => EventType.RoomMessage,
      getContent: () => ({ msgtype: MsgType.Text, body }),
      getId: () => `evt_${events.length + 1}`,
      getSender: () => '@tester:matrix.local',
      getTs: () => 100 + events.length,
    })
    this.roomMessages.set(roomId, events)
    return Promise.resolve({})
  }

  sendEvent(roomId: string, eventType: string, content: Record<string, any>) {
    const events = this.roomMessages.get(roomId) ?? []
    events.push({
      getType: () => eventType,
      getContent: () => content,
      getId: () => `evt_${events.length + 1}`,
      getSender: () => '@tester:matrix.local',
      getTs: () => 200 + events.length,
    })
    this.roomMessages.set(roomId, events)
    return Promise.resolve({})
  }

  redactEvent(roomId: string, eventId: string) {
    this.redactions.push({ roomId, eventId })
    const events = this.roomMessages.get(roomId) ?? []
    this.roomMessages.set(
      roomId,
      events.filter((event) => event.getId() !== eventId),
    )
    return Promise.resolve({})
  }

  uploadContent() {
    return Promise.resolve('mxc://matrix.local/media-id')
  }

  getUserId() {
    return '@tester:matrix.local'
  }
}

describe('MatrixChatService', () => {
  it('supports core chat adapter operations via client factory', async () => {
    const fakeClient = new FakeMatrixClient()
    const service = new MatrixChatService(() => fakeClient as unknown as MatrixClient)

    await service.start({ accessToken: 'token', userId: '@tester:matrix.local' })
    await service.verifySession()

    const joined = service.listJoinedRooms()
    expect(joined).toHaveLength(1)
    expect(joined[0].unreadCount).toBe(2)

    const publicRooms = await service.listPublicRooms(20)
    expect(publicRooms).toHaveLength(1)
    expect(publicRooms[0].id).toBe('!public:matrix.local')

    await service.joinRoom('!public:matrix.local')
    const joinedAfter = service.listJoinedRooms()
    expect(joinedAfter.some((room) => room.id === '!public:matrix.local')).toBe(true)

    const before = service.listMessages('!joined:matrix.local')
    expect(before).toHaveLength(1)

    await service.sendTextMessage('!joined:matrix.local', 'hello matrix')
    await service.sendReaction('!joined:matrix.local', 'evt_seed', '👍')
    await service.sendReplyMessage('!joined:matrix.local', 'evt_seed', 'reply body')
    await service.sendThreadReplyMessage('!joined:matrix.local', 'evt_seed', 'evt_seed', 'thread body')
    await service.editMessage('!joined:matrix.local', 'evt_seed', 'seed edited')
    await service.sendMediaMessage('!joined:matrix.local', new File(['img'], 'photo.png', { type: 'image/png' }))
    await service.deleteMessage('!joined:matrix.local', 'evt_2')
    const after = service.listMessages('!joined:matrix.local')
    const editedSeed = after.find((message) => message.id === 'evt_seed')
    expect(editedSeed?.body).toBe('seed edited')
    expect(editedSeed?.edited).toBe(true)
    expect(editedSeed?.reactions?.some((reaction) => reaction.key === '👍')).toBe(true)
    const replyMessage = after.find((message) => message.body === 'reply body')
    expect(replyMessage?.replyToEventId).toBe('evt_seed')
    const threadMessage = after.find((message) => message.body === 'thread body')
    expect(threadMessage?.replyToEventId).toBe('evt_seed')
    expect(threadMessage?.threadRootEventId).toBe('evt_seed')
    expect(after.some((message) => message.messageType === 'image')).toBe(true)
    expect(fakeClient.redactions.some((item) => item.roomId === '!joined:matrix.local' && item.eventId === 'evt_2')).toBe(true)

    service.stop()
  })

  it('retries rate-limited join and send operations', async () => {
    const fakeClient = new FakeMatrixClient()
    fakeClient.joinRateLimitRemaining = 1
    fakeClient.sendRateLimitRemaining = 1
    const service = new MatrixChatService(() => fakeClient as unknown as MatrixClient)

    await service.start({ accessToken: 'token', userId: '@tester:matrix.local' })
    await service.joinRoom('!public:matrix.local')
    await service.sendTextMessage('!joined:matrix.local', 'retry ok')

    const messages = service.listMessages('!joined:matrix.local')
    expect(messages.some((message) => message.body === 'retry ok')).toBe(true)
    service.stop()
  })

  it('returns a friendly message after repeated matrix rate limits', async () => {
    const fakeClient = new FakeMatrixClient()
    fakeClient.sendRateLimitRemaining = 10
    fakeClient.sendRetryAfterMs = 73_209
    const service = new MatrixChatService(() => fakeClient as unknown as MatrixClient)

    await service.start({ accessToken: 'token', userId: '@tester:matrix.local' })
    await expect(service.sendTextMessage('!joined:matrix.local', 'will fail')).rejects.toThrow(
      'Matrix is rate-limiting chat requests. Please retry in about 74s.',
    )
    service.stop()
  })
})
