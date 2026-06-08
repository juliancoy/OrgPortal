export type NativeChatConversation = {
  id: string
  kind: string
  title?: string | null
  updated_at: string
  last_message_at?: string | null
  unread_count?: number
  members?: Array<{
    user_id: string
    user_name?: string | null
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
  client_message_id?: string | null
  body: string
  sequence?: number | null
  message_type?: 'text' | 'image' | 'file' | 'system'
  created_at: string
  edited_at?: string | null
  deleted_at?: string | null
  moderation_state?: string
}

export type NativeChatSync = {
  conversation_id: string
  latest_sequence: number
  messages: NativeChatMessage[]
  receipts?: unknown[]
  members?: NativeChatConversation['members']
}

export type NativeChatSocketEvent =
  | { type: 'connected'; at?: string }
  | { type: 'pong'; at?: string }
  | { type: 'typing'; conversation_id?: string; user_id?: string; user_name?: string; active?: boolean; at?: string }
  | { type: 'conversation.read'; conversation_id?: string; user_id?: string; message_id?: string; read_at?: string }
  | { type: 'message.created'; conversation_id: string; sequence?: number; message?: NativeChatMessage }
  | { type: 'error'; detail?: string }

function normalizeBaseUrl(rawValue: string | undefined): string {
  const raw = (rawValue || '').trim()
  if (!raw) return 'https://chat-codecollective.jcloiacon.workers.dev'
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
  try {
    const parsed = JSON.parse(text) as { detail?: string }
    throw new Error(parsed.detail || text || `Chat request failed (${response.status})`)
  } catch (err) {
    if (err instanceof Error && err.message !== text) throw err
    throw new Error(text || `Chat request failed (${response.status})`)
  }
}

export class NativeChatApi {
  private readonly tokenProvider: () => Promise<string | null>
  private readonly baseUrl: string

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

  async startDm(targetUserSlug: string): Promise<NativeChatConversation> {
    const payload = await this.request<{ conversation: NativeChatConversation }>('/api/network/chat/dm', {
      method: 'POST',
      body: JSON.stringify({ target_user_slug: targetUserSlug }),
    })
    return payload.conversation
  }

  async getConversation(conversationId: string): Promise<NativeChatConversation> {
    const payload = await this.request<{ conversation: NativeChatConversation }>(
      `/api/network/chat/conversations/${encodeURIComponent(conversationId)}`,
    )
    return payload.conversation
  }

  async sync(conversationId: string, afterSequence: number): Promise<NativeChatSync> {
    return this.request<NativeChatSync>(
      `/api/network/chat/conversations/${encodeURIComponent(conversationId)}/sync?afterSequence=${encodeURIComponent(String(afterSequence))}`,
    )
  }

  async listMessages(conversationId: string): Promise<{ latest_sequence: number; messages: NativeChatMessage[] }> {
    return this.request<{ latest_sequence: number; messages: NativeChatMessage[] }>(
      `/api/network/chat/conversations/${encodeURIComponent(conversationId)}/messages?afterSequence=0`,
    )
  }

  async sendMessage(conversationId: string, clientMessageId: string, body: string): Promise<NativeChatMessage> {
    const payload = await this.request<{ message: NativeChatMessage }>(
      `/api/network/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ client_message_id: clientMessageId, body }),
      },
    )
    return payload.message
  }

  async markRead(conversationId: string, messageId: string): Promise<void> {
    await this.request(`/api/network/chat/conversations/${encodeURIComponent(conversationId)}/read`, {
      method: 'POST',
      body: JSON.stringify({ message_id: messageId }),
    })
  }

  async openConversationSocket(conversationId: string): Promise<WebSocket> {
    const token = await this.tokenProvider()
    if (!token) throw new Error('Chat requires a signed-in session')
    const url = `${websocketBaseUrl(this.baseUrl)}/api/network/chat/conversations/${encodeURIComponent(conversationId)}/socket`
    return new WebSocket(url, [`pidp.${base64Url(token)}`])
  }
}
