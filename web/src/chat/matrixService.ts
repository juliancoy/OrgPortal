import { ClientEvent, EventType, MatrixEvent, MsgType, RelationType, type MatrixClient, type Room, createClient } from 'matrix-js-sdk'
import type { ChatMessage, ChatRoomSummary, ChatService, ChatSession } from '../application/ports/ChatService'
import { MATRIX_BASE_URL } from './matrixSession'

function roomLabel(room: Room): string {
  const rawName = room.name?.trim()
  if (rawName) return rawName
  return room.roomId
}

type ReactionAggregate = Record<string, number>
type ReplacementPayload = {
  body: string
  ts: number
}

function mapMessage(
  event: MatrixEvent,
  room: Room,
  reactions: ReactionAggregate,
  replacement: ReplacementPayload | null,
): ChatMessage | null {
  if (event.getType() !== EventType.RoomMessage) return null
  const content = event.getContent() as {
    msgtype?: string
    body?: string
    info?: { mimetype?: string }
    filename?: string
    url?: string
    ['m.relates_to']?: {
      rel_type?: string
      event_id?: string
      ['m.in_reply_to']?: { event_id?: string }
    }
    ['m.new_content']?: {
      body?: string
    }
  }
  const relation = content['m.relates_to']
  if (relation?.rel_type === RelationType.Replace) return null
  if (!content?.body) return null
  const body = replacement?.body || content.body
  const msgtype = content.msgtype || MsgType.Text
  if (msgtype !== MsgType.Text && msgtype !== MsgType.Image && msgtype !== MsgType.File) return null
  const mediaUrl = resolveMatrixMediaUrl(content.url)
  const sender = event.getSender() ?? 'unknown'
  const senderMember = room.getMember(sender)
  const senderProfile = (event as unknown as { getSenderProfile?: () => { displayname?: string; avatar_url?: string } | null })
    .getSenderProfile?.()
  const senderDisplayName =
    senderMember?.name || senderProfile?.displayname || sender.split(':')[0].replace(/^@/, '') || sender
  const senderAvatarUrl = resolveMatrixMediaUrl(
    senderMember?.events?.member?.getContent?.()?.avatar_url || senderProfile?.avatar_url || null,
  )
  return {
    id: event.getId() ?? `${event.getSender()}-${event.getTs()}`,
    sender,
    senderDisplayName,
    senderAvatarUrl,
    body,
    ts: replacement?.ts ?? event.getTs() ?? Date.now(),
    edited: Boolean(replacement),
    replyToEventId: relation?.['m.in_reply_to']?.event_id || undefined,
    threadRootEventId: relation?.rel_type === RelationType.Thread ? relation.event_id || undefined : undefined,
    messageType: msgtype === MsgType.Text ? 'text' : msgtype === MsgType.Image ? 'image' : 'file',
    mediaUrl,
    mediaMimeType: content.info?.mimetype,
    mediaFileName: content.filename,
    reactions: Object.entries(reactions).map(([key, count]) => ({ key, count })),
  }
}

function resolveMatrixMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  if (url.startsWith('mxc://')) {
    const mxcPath = url.replace('mxc://', '')
    return `${MATRIX_BASE_URL}/_matrix/media/v3/download/${mxcPath}`
  }
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return undefined
}

function mapReactions(events: MatrixEvent[]): Map<string, ReactionAggregate> {
  const byEventId = new Map<string, ReactionAggregate>()
  for (const event of events) {
    if (event.getType() !== EventType.Reaction) continue
    const content = event.getContent() as {
      ['m.relates_to']?: {
        event_id?: string
        rel_type?: string
        key?: string
      }
    }
    const relation = content?.['m.relates_to']
    if (!relation || relation.rel_type !== 'm.annotation' || !relation.event_id || !relation.key) continue
    const forEvent = byEventId.get(relation.event_id) ?? {}
    forEvent[relation.key] = (forEvent[relation.key] ?? 0) + 1
    byEventId.set(relation.event_id, forEvent)
  }
  return byEventId
}

function mapReplacements(events: MatrixEvent[]): Map<string, ReplacementPayload> {
  const byEventId = new Map<string, ReplacementPayload>()
  for (const event of events) {
    if (event.getType() !== EventType.RoomMessage) continue
    const content = event.getContent() as {
      ['m.relates_to']?: {
        rel_type?: string
        event_id?: string
      }
      ['m.new_content']?: {
        body?: string
      }
      body?: string
    }
    const relation = content?.['m.relates_to']
    if (!relation || relation.rel_type !== RelationType.Replace || !relation.event_id) continue
    const nextBody = String(content?.['m.new_content']?.body || content?.body || '').trim()
    if (!nextBody) continue
    const existing = byEventId.get(relation.event_id)
    const candidateTs = event.getTs() ?? Date.now()
    if (!existing || candidateTs >= existing.ts) {
      byEventId.set(relation.event_id, { body: nextBody, ts: candidateTs })
    }
  }
  return byEventId
}

function unreadCountForRoom(room: Room): number {
  try {
    const value = room.getUnreadNotificationCount()
    return Number.isFinite(value) ? Number(value) : 0
  } catch {
    return 0
  }
}

function lastActivityForRoom(room: Room): number | undefined {
  try {
    const candidate =
      typeof (room as unknown as { getLastActiveTimestamp?: () => number }).getLastActiveTimestamp === 'function'
        ? (room as unknown as { getLastActiveTimestamp: () => number }).getLastActiveTimestamp()
        : 0
    return Number.isFinite(candidate) && candidate > 0 ? Number(candidate) : undefined
  } catch {
    return undefined
  }
}

type MatrixClientFactory = typeof createClient
type MatrixRateLimitPayload = { errcode?: string; retry_after_ms?: number }

const MATRIX_RATE_LIMIT_MAX_RETRIES = 2
const MATRIX_RATE_LIMIT_WAIT_CAP_MS = 1_500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms)
  })
}

function parseRateLimitPayload(err: unknown): MatrixRateLimitPayload {
  const candidate = err as {
    data?: MatrixRateLimitPayload
    body?: MatrixRateLimitPayload
    errcode?: string
    retry_after_ms?: number
  }
  const data = (candidate?.data || candidate?.body || {}) as MatrixRateLimitPayload
  return {
    errcode: String(data.errcode || candidate?.errcode || ''),
    retry_after_ms: Number(data.retry_after_ms || candidate?.retry_after_ms || 0),
  }
}

function isMatrixRateLimitError(err: unknown): boolean {
  const payload = parseRateLimitPayload(err)
  if (payload.errcode === 'M_LIMIT_EXCEEDED') return true
  const candidate = err as { httpStatus?: number; statusCode?: number; status?: number }
  return candidate?.httpStatus === 429 || candidate?.statusCode === 429 || candidate?.status === 429
}

function matrixRateLimitErrorMessage(retryAfterMs?: number): string {
  if (!retryAfterMs || retryAfterMs <= 0) {
    return 'Matrix is temporarily rate-limiting chat requests. Please try again shortly.'
  }
  const waitSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
  return `Matrix is rate-limiting chat requests. Please retry in about ${waitSeconds}s.`
}

export class MatrixChatService implements ChatService {
  private client: MatrixClient | null = null
  private readonly clientFactory: MatrixClientFactory

  constructor(clientFactory: MatrixClientFactory = createClient) {
    this.clientFactory = clientFactory
  }

  async start(session: ChatSession): Promise<MatrixClient> {
    if (this.client) return this.client

    const client = this.clientFactory({
      baseUrl: MATRIX_BASE_URL,
      accessToken: session.accessToken,
      userId: session.userId,
      deviceId: session.deviceId,
      timelineSupport: true,
    })

    await new Promise<void>((resolve, reject) => {
      const onSync = (state: string) => {
        if (state === 'PREPARED' || state === 'SYNCING') {
          client.off(ClientEvent.Sync, onSync)
          resolve()
          return
        }
        if (state === 'ERROR') {
          client.off(ClientEvent.Sync, onSync)
          reject(new Error('Matrix sync failed'))
        }
      }
      client.on(ClientEvent.Sync, onSync)
      client.startClient({ initialSyncLimit: 50 })
    })

    this.client = client
    return client
  }

  stop(): void {
    if (!this.client) return
    this.client.stopClient()
    this.client.removeAllListeners()
    this.client = null
  }

  getClient(): MatrixClient {
    if (!this.client) throw new Error('Matrix client is not initialized')
    return this.client
  }

  private async withRateLimitRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await operation()
      } catch (err) {
        if (!isMatrixRateLimitError(err)) throw err
        const payload = parseRateLimitPayload(err)
        const retryAfterMs = Number.isFinite(payload.retry_after_ms) ? Number(payload.retry_after_ms) : 0
        if (attempt >= MATRIX_RATE_LIMIT_MAX_RETRIES) {
          throw new Error(matrixRateLimitErrorMessage(retryAfterMs))
        }
        const waitMs = Math.max(250, Math.min(retryAfterMs || 500, MATRIX_RATE_LIMIT_WAIT_CAP_MS))
        await sleep(waitMs)
      }
    }
  }

  async verifySession(): Promise<void> {
    const client = this.getClient()
    await client.whoami()
  }

  listJoinedRooms(): ChatRoomSummary[] {
    const client = this.getClient()
    return client
      .getRooms()
      .filter((room) => room.getMyMembership() === 'join')
      .map((room) => ({
        id: room.roomId,
        name: roomLabel(room),
        avatarUrl: resolveMatrixMediaUrl(room.getAvatarUrl(client.getHomeserverUrl(), 96, 96, 'crop') || undefined),
        unreadCount: unreadCountForRoom(room),
        lastActivityTs: lastActivityForRoom(room),
      }))
      .sort((a, b) => {
        const aTs = a.lastActivityTs ?? 0
        const bTs = b.lastActivityTs ?? 0
        if (aTs !== bTs) return bTs - aTs
        return a.name.localeCompare(b.name)
      })
  }

  async listPublicRooms(limit = 50): Promise<ChatRoomSummary[]> {
    const client = this.getClient()
    const response = await client.publicRooms({ limit })
    const chunk = Array.isArray(response.chunk) ? response.chunk : []
    return chunk
      .map((room) => ({
        id: room.room_id,
        name: room.name || room.canonical_alias || room.room_id,
        avatarUrl: resolveMatrixMediaUrl(room.avatar_url || undefined),
        unreadCount: 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async joinRoom(roomId: string): Promise<void> {
    const client = this.getClient()
    await this.withRateLimitRetry(async () => {
      await client.joinRoom(roomId)
    })
  }

  listMessages(roomId: string): ChatMessage[] {
    const client = this.getClient()
    const room = client.getRoom(roomId)
    if (!room) return []
    const events = room.getLiveTimeline().getEvents()
    const reactions = mapReactions(events)
    const replacements = mapReplacements(events)
    return room
      .getLiveTimeline()
      .getEvents()
      .map((event) =>
        mapMessage(
          event,
          room,
          reactions.get(event.getId() ?? '') ?? {},
          replacements.get(event.getId() ?? '') ?? null,
        ),
      )
      .filter((msg): msg is ChatMessage => Boolean(msg))
      .sort((a, b) => a.ts - b.ts)
  }

  async sendTextMessage(roomId: string, body: string): Promise<void> {
    const client = this.getClient()
    await this.withRateLimitRetry(async () => {
      await client.sendTextMessage(roomId, body)
    })
  }

  async sendReaction(roomId: string, eventId: string, key: string): Promise<void> {
    const client = this.getClient()
    await this.withRateLimitRetry(async () => {
      await client.sendEvent(roomId, EventType.Reaction, {
        'm.relates_to': {
          rel_type: RelationType.Annotation,
          event_id: eventId,
          key,
        },
      } as any)
    })
  }

  async sendMediaMessage(roomId: string, file: File): Promise<void> {
    const client = this.getClient()
    const uploadResult = (await this.withRateLimitRetry(async () => (await client.uploadContent(file, {
      type: file.type || 'application/octet-stream',
      name: file.name,
    } as any)) as any)) as any
    const contentUri = typeof uploadResult === 'string' ? uploadResult : uploadResult?.content_uri
    if (!contentUri) {
      throw new Error('Matrix media upload failed')
    }
    const isImage = file.type.startsWith('image/')
    await this.withRateLimitRetry(async () => {
      await client.sendEvent(roomId, EventType.RoomMessage, {
        msgtype: isImage ? MsgType.Image : MsgType.File,
        body: file.name,
        filename: file.name,
        url: contentUri,
        info: {
          mimetype: file.type || 'application/octet-stream',
          size: file.size,
        },
      } as any)
    })
  }

  async sendReplyMessage(roomId: string, eventId: string, body: string): Promise<void> {
    const client = this.getClient()
    await this.withRateLimitRetry(async () => {
      await client.sendEvent(
        roomId,
        EventType.RoomMessage,
        {
          msgtype: MsgType.Text,
          body,
          'm.relates_to': {
            'm.in_reply_to': {
              event_id: eventId,
            },
          },
        } as any,
      )
    })
  }

  async sendThreadReplyMessage(roomId: string, threadRootEventId: string, parentEventId: string, body: string): Promise<void> {
    const client = this.getClient()
    await this.withRateLimitRetry(async () => {
      await client.sendEvent(
        roomId,
        EventType.RoomMessage,
        {
          msgtype: MsgType.Text,
          body,
          'm.relates_to': {
            rel_type: RelationType.Thread,
            event_id: threadRootEventId,
            is_falling_back: true,
            'm.in_reply_to': {
              event_id: parentEventId,
            },
          },
        } as any,
      )
    })
  }

  async editMessage(roomId: string, eventId: string, body: string): Promise<void> {
    const client = this.getClient()
    const trimmed = body.trim()
    if (!trimmed) return
    await this.withRateLimitRetry(async () => {
      await client.sendEvent(
        roomId,
        EventType.RoomMessage,
        {
          msgtype: MsgType.Text,
          body: `* ${trimmed}`,
          'm.new_content': {
            msgtype: MsgType.Text,
            body: trimmed,
          },
          'm.relates_to': {
            rel_type: RelationType.Replace,
            event_id: eventId,
          },
        } as any,
      )
    })
  }

  async deleteMessage(roomId: string, eventId: string): Promise<void> {
    const client = this.getClient()
    await this.withRateLimitRetry(async () => {
      await (client as any).redactEvent(roomId, eventId, undefined, { reason: 'Deleted by sender' })
    })
  }
}
