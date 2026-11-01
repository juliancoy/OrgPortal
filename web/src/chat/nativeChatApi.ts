import { browserChatKeys, decryptChatBody, encryptChatBody, existingChatKeys, forgetChatKeys } from './chatEncryption'
import type { ChatEncryptedMessage, ChatEncryptionMode, ChatSecurity } from '../../../shared/chatEncryption'

export type NativeChatReactionOwner = {
  user_id: string
  user_name?: string | null
  avatar_url?: string | null
  created_at?: string | null
}

export type NativeChatReaction = {
  key: string
  count: number
  reacted?: boolean
  users?: NativeChatReactionOwner[]
}

export type NativeChatConversation = {
  id: string
  kind: string
  encryption_mode?: ChatEncryptionMode
  encryption_revision?: number
  title?: string | null
  org_id?: string | null
  event_id?: string | null
  updated_at: string
  last_message_at?: string | null
  unread_count?: number
  members?: Array<{
    user_id: string
    user_name?: string | null
    avatar_url?: string | null
    role?: string
    state?: string
  }>
  last_message?: {
    body?: string | null
    sender_user_id?: string | null
    created_at?: string | null
    sequence?: number | null
  } | null
}

export type NativeChatMessage = {
  id: string
  conversation_id: string
  sender_user_id: string
  sender_name?: string | null
  sender_avatar_url?: string | null
  client_message_id?: string | null
  body: string
  encryption?: ChatEncryptedMessage | null
  decryption_state?: 'decrypted' | 'unavailable' | 'invalid'
  sequence?: number | null
  message_type?: 'text' | 'image' | 'file' | 'system'
  reply_to_message_id?: string | null
  thread_root_message_id?: string | null
  created_at: string
  edited_at?: string | null
  deleted_at?: string | null
  moderation_state?: string
  reactions?: NativeChatReaction[]
}

export type NativeChatSync = {
  conversation_id: string
  latest_sequence: number
  messages: NativeChatMessage[]
  receipts?: unknown[]
  members?: NativeChatConversation['members']
}

export type NativeChatDmTarget = {
  userId?: string
  userName?: string | null
  slug?: string
}

export type NativeChatPresence = {
  user_id: string
  online: boolean
}

export type NativeChatSocketEvent =
  | { type: 'conversation.security'; conversation_id: string; mode: ChatEncryptionMode; revision: number }
  | { type: 'connected'; at?: string }
  | { type: 'pong'; at?: string }
  | { type: 'typing'; conversation_id?: string; user_id?: string; user_name?: string; active?: boolean; at?: string }
  | { type: 'conversation.read'; conversation_id?: string; user_id?: string; message_id?: string; read_at?: string }
  | { type: 'message.created'; conversation_id: string; sequence?: number; message?: NativeChatMessage }
  | { type: 'message.reacted'; conversation_id: string; message_id: string; reactions: NativeChatReaction[] }
  | {
      type: 'call.signal'
      conversation_id: string
      call_id: string
      signal: 'invite' | 'offer' | 'answer' | 'ice' | 'hangup'
      from_user_id: string
      from_user_name?: string
      target_user_id?: string
      description?: RTCSessionDescriptionInit
      candidate?: RTCIceCandidateInit
    }
  | { type: 'error'; detail?: string }

function normalizeBaseUrl(rawValue: string | undefined): string {
  const raw = (rawValue || '').trim()
  if (!raw) return '/api/chat'
  return raw.replace(/\/+$/, '')
}

export const NATIVE_CHAT_API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_CHAT_API_BASE_URL as string | undefined,
)

function websocketBaseUrl(rawBase: string): string {
  if (rawBase.startsWith('https://')) return `wss://${rawBase.slice('https://'.length)}`
  if (rawBase.startsWith('http://')) return `ws://${rawBase.slice('http://'.length)}`
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://codecollective.us'
  const absolute = new URL(rawBase || '/', origin).toString().replace(/\/+$/, '')
  return websocketBaseUrl(absolute)
}

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T
  const text = await response.text().catch(() => '')
  let detail = ''
  if (text) {
    try {
      const parsed = JSON.parse(text) as { detail?: string; error?: string; message?: string }
      detail = parsed.detail || parsed.error || parsed.message || ''
    } catch {
      detail = text
    }
  }
  throw new Error(detail || `Chat request failed (${response.status})`)
}

export class NativeChatApi {
  private readonly tokenProvider: () => Promise<string | null>
  private readonly baseUrl: string
  private currentUserId: string | null = null

  constructor(tokenProvider: () => Promise<string | null>, baseUrl = NATIVE_CHAT_API_BASE_URL) {
    this.tokenProvider = tokenProvider
    this.baseUrl = baseUrl
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.tokenProvider()
    if (!token) throw new Error('Chat requires a signed-in session')
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    })
    return readJson<T>(response)
  }

  async listConversations(): Promise<NativeChatConversation[]> {
    const payload = await this.request<{ conversations: NativeChatConversation[] }>('/api/network/chat/conversations')
    return payload.conversations || []
  }

  async startDm(target: NativeChatDmTarget): Promise<NativeChatConversation> {
    const payload = await this.request<{ conversation: NativeChatConversation }>('/api/network/chat/dm', {
      method: 'POST',
      body: JSON.stringify({
        target_user_id: target.userId,
        target_user_name: target.userName,
        target_user_slug: target.slug,
      }),
    })
    return payload.conversation
  }

  async startOrganizationRoom(slug: string): Promise<NativeChatConversation> {
    const payload = await this.request<{ conversation: NativeChatConversation }>('/api/network/chat/org-room', {
      method: 'POST',
      body: JSON.stringify({ organization_slug: slug }),
    })
    return payload.conversation
  }

  async startEventRoom(event: { eventId: string; title: string; orgId?: string | null }): Promise<NativeChatConversation> {
    const payload = await this.request<{ conversation: NativeChatConversation }>('/api/network/chat/event-room', {
      method: 'POST',
      body: JSON.stringify({
        event_id: event.eventId,
        title: event.title,
        org_id: event.orgId || null,
      }),
    })
    return payload.conversation
  }

  async postEventComment(eventId: string, clientMessageId: string, body: string): Promise<{ conversation: NativeChatConversation; message: NativeChatMessage }> {
    let payload: { conversation: NativeChatConversation }
    try {
      payload = await this.request('/api/network/chat/event-room', { method: 'POST', body: JSON.stringify({ event_id: eventId }) })
    } catch (error) {
      // A new public event room starts with its first (unencrypted) comment.
      // Existing rooms must resolve their policy before any content is sent.
      if (!(error instanceof Error) || error.message !== 'Post a comment to start this event conversation') throw error
      return this.request('/api/network/chat/event-room', { method: 'POST', body: JSON.stringify({ event_id: eventId, initial_comment: body, client_message_id: clientMessageId }) })
    }
    return { conversation: payload.conversation, message: await this.sendMessage(payload.conversation.id, clientMessageId, body) }
  }

  async getConversation(conversationId: string): Promise<NativeChatConversation> {
    const payload = await this.request<{ conversation: NativeChatConversation }>(
      `/api/network/chat/conversations/${encodeURIComponent(conversationId)}`,
    )
    return payload.conversation
  }

  async sync(conversationId: string, afterSequence: number): Promise<NativeChatSync> {
    const payload = await this.request<NativeChatSync>(
      `/api/network/chat/conversations/${encodeURIComponent(conversationId)}/sync?afterSequence=${encodeURIComponent(String(afterSequence))}`,
    )
    return { ...payload, messages: await Promise.all(payload.messages.map(message => this.decryptMessage(message))) }
  }

  async listMessages(conversationId: string): Promise<{ latest_sequence: number; messages: NativeChatMessage[] }> {
    const payload = await this.request<{ latest_sequence: number; messages: NativeChatMessage[] }>(
      `/api/network/chat/conversations/${encodeURIComponent(conversationId)}/messages?afterSequence=0`,
    )
    return { ...payload, messages: await Promise.all(payload.messages.map(message => this.decryptMessage(message))) }
  }

  async sendMessage(conversationId: string, clientMessageId: string, body: string, options: { replyToMessageId?: string; threadRootMessageId?: string } = {}): Promise<NativeChatMessage> {
    const security = await this.prepareEncryption(conversationId)
    const encryption = security.mode === 'none' ? undefined : await encryptChatBody(body, conversationId, clientMessageId, security, await browserChatKeys(security.current_user_id))
    const payload = await this.request<{ message: NativeChatMessage }>(
      `/api/network/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          client_message_id: clientMessageId,
          body: encryption ? undefined : body,
          encryption,
          reply_to_message_id: options.replyToMessageId,
          thread_root_message_id: options.threadRootMessageId,
        }),
      },
    )
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('portal:inbox-changed'))
    return this.decryptMessage(payload.message)
  }

  async getSecurity(conversationId: string): Promise<ChatSecurity> {
    const security = await this.request<ChatSecurity>(`/api/network/chat/conversations/${encodeURIComponent(conversationId)}/security`)
    if (!security.current_user_id || !['none', 'rsa', 'rsa-mlkem'].includes(security.mode)) throw new Error('Chat protection could not be verified. Your message has not been sent.')
    this.currentUserId = security.current_user_id
    return security
  }

  async prepareEncryption(conversationId: string, force = false): Promise<ChatSecurity> {
    const security = await this.getSecurity(conversationId)
    if (security.mode === 'none' && !force) return security
    const keys = await browserChatKeys(security.current_user_id)
    await this.request('/api/network/chat/devices', { method: 'POST', body: JSON.stringify(keys.public_key) })
    return this.getSecurity(conversationId)
  }

  async setEncryption(conversationId: string, mode: ChatEncryptionMode): Promise<ChatSecurity> {
    const security = await this.prepareEncryption(conversationId, mode !== 'none')
    if (!security.can_manage) throw new Error('Only a current chat administrator can change encryption.')
    return this.request(`/api/network/chat/conversations/${encodeURIComponent(conversationId)}/security`, {
      method: 'PATCH', body: JSON.stringify({ mode, expected_revision: security.revision }),
    })
  }

  async forgetEncryptionDevice(conversationId: string): Promise<void> {
    const security = await this.getSecurity(conversationId), keys = await existingChatKeys(security.current_user_id)
    if (keys) await this.request(`/api/network/chat/devices/${encodeURIComponent(keys.public_key.device_id)}`, { method: 'DELETE' })
    await forgetChatKeys(security.current_user_id)
  }

  async decryptMessage(message: NativeChatMessage): Promise<NativeChatMessage> {
    if (!message.encryption || message.deleted_at) return message
    try {
      const envelope = message.encryption
      if (envelope.conversation_id !== message.conversation_id || envelope.sender_user_id !== message.sender_user_id || envelope.client_message_id !== message.client_message_id) throw new Error('Encrypted message context does not match')
      const userId = this.currentUserId || (await this.getSecurity(message.conversation_id)).current_user_id
      const keys = await existingChatKeys(userId)
      if (!keys || !envelope.recipients.some(recipient => recipient.device_id === keys.public_key.device_id))
        return { ...message, body: 'Encrypted message — this browser does not have its key.', decryption_state: 'unavailable' }
      return { ...message, body: await decryptChatBody(envelope, keys), decryption_state: 'decrypted' }
    } catch {
      return { ...message, body: 'Encrypted message could not be authenticated in this browser.', decryption_state: 'invalid' }
    }
  }

  async sendReaction(conversationId: string, messageId: string, emoji: string): Promise<NativeChatReaction[]> {
    const payload = await this.request<{ reactions: NativeChatReaction[] }>(
      `/api/network/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      },
    )
    return payload.reactions || []
  }

  async markRead(conversationId: string, messageId: string): Promise<void> {
    await this.request(`/api/network/chat/conversations/${encodeURIComponent(conversationId)}/read`, {
      method: 'POST',
      body: JSON.stringify({ message_id: messageId }),
    })
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('portal:inbox-changed'))
  }

  async heartbeatPresence(): Promise<void> {
    await this.request('/api/network/chat/presence', { method: 'POST' })
  }

  async getPresence(userIds: string[]): Promise<NativeChatPresence[]> {
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)))
    const chunks: string[][] = []
    for (let index = 0; index < uniqueIds.length; index += 100) chunks.push(uniqueIds.slice(index, index + 100))
    const payloads = await Promise.all(chunks.map((chunk) => this.request<{ presence: NativeChatPresence[] }>(
      `/api/network/chat/presence?user_ids=${encodeURIComponent(chunk.join(','))}`,
    )))
    return payloads.flatMap((payload) => payload.presence || [])
  }

  async openConversationSocket(conversationId: string): Promise<WebSocket> {
    const token = await this.tokenProvider()
    if (!token) throw new Error('Chat requires a signed-in session')
    const url = `${websocketBaseUrl(this.baseUrl)}/api/network/chat/conversations/${encodeURIComponent(conversationId)}/socket`
    return new WebSocket(url, [`pidp.${base64Url(token)}`])
  }

  async getIceServers(): Promise<RTCIceServer[]> {
    const payload = await this.request<{ ice_servers?: RTCIceServer[] }>('/api/network/chat/ice-servers')
    return payload.ice_servers?.length ? payload.ice_servers : [{ urls: ['stun:stun.cloudflare.com:3478'] }]
  }
}
