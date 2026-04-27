import type { ChatMessage } from '../../application/ports/ChatService'

const ORG_CHAT_FEED_PREFIX = 'orgportal.chat.feed.'
const ORG_CHAT_LIVE_PREFIX = 'orgportal.chat.live.'
const ORG_CHAT_FEED_TTL_MS = 5 * 60 * 1000
const ORG_CHAT_LIVE_TTL_MS = 2 * 60 * 1000
const MAX_LIVE_MESSAGES = 120

type TimedCacheEnvelope<T> = {
  ts: number
  value: T
}

function readEnvelope<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TimedCacheEnvelope<T>
    if (!parsed || typeof parsed.ts !== 'number') return null
    if (Date.now() - parsed.ts > ttlMs) return null
    return parsed.value
  } catch {
    return null
  }
}

function writeEnvelope<T>(key: string, value: T): void {
  try {
    const payload: TimedCacheEnvelope<T> = { ts: Date.now(), value }
    localStorage.setItem(key, JSON.stringify(payload))
  } catch {
    // Ignore quota and storage errors.
  }
}

function roomMessagesKey(roomId: string): string {
  return `${ORG_CHAT_LIVE_PREFIX}${encodeURIComponent(roomId)}`
}

function orgChatFeedKey(slug: string): string {
  return `${ORG_CHAT_FEED_PREFIX}${encodeURIComponent(slug)}`
}

export function readCachedOrgChatFeed<T>(slug: string): T | null {
  return readEnvelope<T>(orgChatFeedKey(slug), ORG_CHAT_FEED_TTL_MS)
}

export function writeCachedOrgChatFeed<T>(slug: string, payload: T): void {
  writeEnvelope(orgChatFeedKey(slug), payload)
}

function sanitizeMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  const id = String(entry.id || '').trim()
  const sender = String(entry.sender || '').trim()
  const body = String(entry.body || '')
  const ts = Number(entry.ts)
  if (!id || !sender || !Number.isFinite(ts)) return null

  const reactions = Array.isArray(entry.reactions)
    ? entry.reactions
        .map((reaction) => {
          if (!reaction || typeof reaction !== 'object') return null
          const parsed = reaction as Record<string, unknown>
          const key = String(parsed.key || '').trim()
          const count = Number(parsed.count)
          if (!key || !Number.isFinite(count)) return null
          return { key, count }
        })
        .filter((reaction): reaction is { key: string; count: number } => Boolean(reaction))
    : undefined

  return {
    id,
    sender,
    body,
    ts,
    edited: Boolean(entry.edited),
    replyToEventId: typeof entry.replyToEventId === 'string' ? entry.replyToEventId : undefined,
    threadRootEventId: typeof entry.threadRootEventId === 'string' ? entry.threadRootEventId : undefined,
    messageType:
      entry.messageType === 'image' || entry.messageType === 'file' || entry.messageType === 'text'
        ? entry.messageType
        : undefined,
    mediaUrl: typeof entry.mediaUrl === 'string' ? entry.mediaUrl : undefined,
    mediaMimeType: typeof entry.mediaMimeType === 'string' ? entry.mediaMimeType : undefined,
    mediaFileName: typeof entry.mediaFileName === 'string' ? entry.mediaFileName : undefined,
    reactions,
  }
}

export function readCachedRoomMessages(roomId: string): ChatMessage[] {
  const payload = readEnvelope<unknown[]>(roomMessagesKey(roomId), ORG_CHAT_LIVE_TTL_MS)
  if (!Array.isArray(payload)) return []
  return payload.map(sanitizeMessage).filter((message): message is ChatMessage => Boolean(message))
}

export function writeCachedRoomMessages(roomId: string, messages: ChatMessage[]): void {
  const sorted = [...messages]
    .sort((a, b) => a.ts - b.ts)
    .slice(Math.max(0, messages.length - MAX_LIVE_MESSAGES))
  writeEnvelope(roomMessagesKey(roomId), sorted)
}

