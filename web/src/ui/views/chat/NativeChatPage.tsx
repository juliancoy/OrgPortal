import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { NativeChatApi, type NativeChatConversation, type NativeChatMessage, type NativeChatSocketEvent } from '../../../chat/nativeChatApi'
import { refreshRuntimeTokenFromSession } from '../../../infrastructure/auth/sessionToken'
import { toUserFacingErrorMessage } from '../../../infrastructure/http/userFacingError'

type MessageState = NativeChatMessage & {
  delivery_state?: 'pending' | 'confirmed' | 'failed'
}

type RealtimeState = 'idle' | 'connecting' | 'connected' | 'reconnecting'

function timestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function conversationLabel(conversation: NativeChatConversation, myUserId?: string | null): string {
  if (conversation.title?.trim()) return conversation.title.trim()
  const other = (conversation.members || []).find((member) => member.user_id !== myUserId)
  if (other?.user_name?.trim()) return other.user_name.trim()
  if (conversation.kind === 'dm') return 'Direct message'
  return conversation.id
}

function messageAuthor(message: NativeChatMessage, myUserId?: string | null): string {
  if (myUserId && message.sender_user_id === myUserId) return 'You'
  return message.sender_name?.trim() || message.sender_user_id
}

function uuid() {
  if ('crypto' in window && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID()
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function NativeChatPage() {
  const { token, user } = useAuth()
  const { roomId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [conversations, setConversations] = useState<NativeChatConversation[]>([])
  const [messages, setMessages] = useState<MessageState[]>([])
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState('Loading chat...')
  const [error, setError] = useState<string | null>(null)
  const [latestSequence, setLatestSequence] = useState(0)
  const latestSequenceRef = useRef(0)
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('idle')
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const api = useMemo(
    () =>
      new NativeChatApi(async () => {
        return token || (await refreshRuntimeTokenFromSession())
      }),
    [token],
  )

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === roomId) || null,
    [conversations, roomId],
  )

  const mergeMessages = useCallback((incoming: NativeChatMessage[]) => {
    setMessages((current) => {
      const byKey = new Map<string, MessageState>()
      for (const message of current) {
        byKey.set(message.client_message_id || message.id, message)
      }
      for (const message of incoming) {
        byKey.set(message.client_message_id || message.id, { ...message, delivery_state: 'confirmed' })
      }
      return Array.from(byKey.values()).sort(
        (a, b) =>
          Number(a.sequence || Number.MAX_SAFE_INTEGER) - Number(b.sequence || Number.MAX_SAFE_INTEGER) ||
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
    })
  }, [])

  const refreshConversations = useCallback(async () => {
    const rows = await api.listConversations()
    setConversations(rows)
    return rows
  }, [api])

  const syncConversation = useCallback(
    async (activeRoomId: string, afterSequence = latestSequenceRef.current) => {
      const payload = await api.sync(activeRoomId, afterSequence)
      if (payload.messages.length > 0) {
        mergeMessages(payload.messages)
        const last = payload.messages.at(-1)
        if (last?.id) api.markRead(activeRoomId, last.id).catch(() => {})
        refreshConversations().catch(() => {})
      }
      const nextSequence = payload.latest_sequence || afterSequence
      latestSequenceRef.current = nextSequence
      setLatestSequence(nextSequence)
      return payload
    },
    [api, mergeMessages, refreshConversations],
  )

  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      try {
        setStatus('Loading conversations...')
        setError(null)
        const start = searchParams.get('start')
        const targetUser = searchParams.get('user')
        if (start === 'dm' && targetUser) {
          const conversation = await api.startDm(targetUser)
          if (!cancelled) {
            setConversations((current) => {
              const next = current.filter((item) => item.id !== conversation.id)
              return [conversation, ...next]
            })
            navigate(`/chat/${encodeURIComponent(conversation.id)}`, { replace: true })
          }
          return
        }
        const rows = await refreshConversations()
        if (!cancelled && !roomId && rows[0]) {
          navigate(`/chat/${encodeURIComponent(rows[0].id)}`, { replace: true })
        }
      } catch (err) {
        if (!cancelled) setError(toUserFacingErrorMessage(err, 'Failed to load native chat'))
      } finally {
        if (!cancelled) setStatus('')
      }
    }
    bootstrap().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [api, navigate, refreshConversations, roomId, searchParams])

  useEffect(() => {
    if (!roomId) {
      setMessages([])
      setLatestSequence(0)
      setRealtimeState('idle')
      return
    }
    const activeRoomId: string = roomId
    let cancelled = false
    async function load() {
      try {
        setStatus('Loading messages...')
        setError(null)
        const payload = await api.listMessages(activeRoomId)
        if (cancelled) return
        latestSequenceRef.current = payload.latest_sequence || 0
        setLatestSequence(payload.latest_sequence || 0)
        setMessages(payload.messages.map((message) => ({ ...message, delivery_state: 'confirmed' })))
        const last = payload.messages.at(-1)
        if (last?.id) api.markRead(activeRoomId, last.id).catch(() => {})
      } catch (err) {
        if (!cancelled) setError(toUserFacingErrorMessage(err, 'Failed to load messages'))
      } finally {
        if (!cancelled) setStatus('')
      }
    }
    load().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [api, roomId])

  useEffect(() => {
    const className = 'chat-realtime-disconnected'
    const body = document.body
    if (realtimeState === 'connecting' || realtimeState === 'reconnecting') {
      body.classList.add(className)
    } else {
      body.classList.remove(className)
    }
    return () => {
      body.classList.remove(className)
    }
  }, [realtimeState])

  useEffect(() => {
    if (!roomId) return
    const activeRoomId = roomId
    let cancelled = false
    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempt = 0

    function scheduleReconnect() {
      if (cancelled) return
      const delay = Math.min(15000, 1000 * 2 ** reconnectAttempt)
      reconnectAttempt += 1
      reconnectTimer = setTimeout(() => {
        connect().catch(() => scheduleReconnect())
      }, delay)
    }

    async function handleEvent(event: NativeChatSocketEvent) {
      if (event.type === 'message.created' && event.conversation_id === activeRoomId) {
        if (event.message) {
          mergeMessages([event.message])
          const nextSequence = Math.max(latestSequenceRef.current, Number(event.sequence || event.message.sequence || 0))
          latestSequenceRef.current = nextSequence
          setLatestSequence(nextSequence)
          api.markRead(activeRoomId, event.message.id).catch(() => {})
          refreshConversations().catch(() => {})
          return
        }
        await syncConversation(activeRoomId)
        return
      }
      if (event.type === 'conversation.read' && event.conversation_id === activeRoomId) {
        refreshConversations().catch(() => {})
      }
    }

    async function connect() {
      setRealtimeState(reconnectAttempt > 0 ? 'reconnecting' : 'connecting')
      socket = await api.openConversationSocket(activeRoomId)
      socket.addEventListener('open', () => {
        reconnectAttempt = 0
        setRealtimeState('connected')
      })
      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return
        try {
          const parsed = JSON.parse(event.data) as NativeChatSocketEvent
          handleEvent(parsed).catch(() => {})
        } catch {
          // Ignore malformed realtime events; polling remains authoritative.
        }
      })
      socket.addEventListener('close', () => {
        socket = null
        setRealtimeState('reconnecting')
        syncConversation(activeRoomId).catch(() => {})
        scheduleReconnect()
      })
      socket.addEventListener('error', () => {
        try {
          socket?.close()
        } catch {
          // Ignore close failures.
        }
      })
    }

    connect().catch(() => scheduleReconnect())

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close(1000, 'Route changed')
      } else if (socket) {
        socket.close()
      }
      setRealtimeState('idle')
    }
  }, [api, mergeMessages, refreshConversations, roomId, syncConversation])

  useEffect(() => {
    if (!roomId) return
    const activeRoomId: string = roomId
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    async function poll() {
      const visible = document.visibilityState === 'visible'
      const baseDelay = visible ? 2200 : 20000
      const jitter = Math.floor(Math.random() * 700)
      try {
        const payload = await api.sync(activeRoomId, latestSequenceRef.current)
        if (!cancelled) {
          if (payload.messages.length > 0) {
            mergeMessages(payload.messages)
            latestSequenceRef.current = payload.latest_sequence || latestSequenceRef.current
            setLatestSequence(payload.latest_sequence || latestSequenceRef.current)
            const last = payload.messages.at(-1)
            if (last?.id) api.markRead(activeRoomId, last.id).catch(() => {})
            refreshConversations().catch(() => {})
          } else {
            latestSequenceRef.current = payload.latest_sequence || latestSequenceRef.current
            setLatestSequence(payload.latest_sequence || latestSequenceRef.current)
          }
        }
      } catch {
        // Keep polling; transient chat failures should not tear down the page.
      } finally {
        if (!cancelled) timeoutId = setTimeout(poll, baseDelay + jitter)
      }
    }

    timeoutId = setTimeout(poll, 1200)
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      if (timeoutId) clearTimeout(timeoutId)
      poll().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onVisibility)
    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onVisibility)
    }
  }, [api, mergeMessages, refreshConversations, roomId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    const body = draft.trim()
    if (!body || !roomId) return
    const clientMessageId = uuid()
    const pending: MessageState = {
      id: clientMessageId,
      conversation_id: roomId,
      sender_user_id: user?.id || 'me',
      sender_name: user?.displayName || user?.email || 'You',
      client_message_id: clientMessageId,
      body,
      message_type: 'text',
      created_at: new Date().toISOString(),
      delivery_state: 'pending',
    }
    setDraft('')
    setIsSending(true)
    setMessages((current) => [...current, pending])
    try {
      const confirmed = await api.sendMessage(roomId, clientMessageId, body)
      mergeMessages([confirmed])
      const nextSequence = Math.max(latestSequenceRef.current, Number(confirmed.sequence || 0))
      latestSequenceRef.current = nextSequence
      setLatestSequence(nextSequence)
      refreshConversations().catch(() => {})
    } catch (err) {
      setMessages((current) =>
        current.map((message) =>
          message.client_message_id === clientMessageId ? { ...message, delivery_state: 'failed' } : message,
        ),
      )
      setError(toUserFacingErrorMessage(err, 'Failed to send message'))
    } finally {
      setIsSending(false)
    }
  }

  return (
    <section className="portal-chat-shell native-chat-shell">
      <aside className="portal-chat-sidebar">
        <div className="portal-chat-sidebar-header">
          <h2>Conversations</h2>
          <Link to="/chat" className="portal-chat-home-link">Reset</Link>
        </div>
        <ul className="portal-chat-room-list">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                className={`portal-chat-room-btn ${conversation.id === roomId ? 'active' : ''}`}
                onClick={() => navigate(`/chat/${encodeURIComponent(conversation.id)}`)}
              >
                <span className="portal-chat-room-label">
                  <span className="portal-avatar portal-chat-room-avatar">
                    {conversationLabel(conversation, user?.id).slice(0, 1).toUpperCase()}
                  </span>
                  <span>{conversationLabel(conversation, user?.id)}</span>
                </span>
                {conversation.unread_count ? <span className="portal-chat-unread">{conversation.unread_count}</span> : null}
              </button>
            </li>
          ))}
          {conversations.length === 0 ? <li className="portal-chat-muted">No conversations yet.</li> : null}
        </ul>
      </aside>

      <div className="portal-chat-main">
        {roomId ? (
          <>
            <header className="portal-chat-room-header">
              <div className="portal-chat-room-header-row">
                <h1>{selectedConversation ? conversationLabel(selectedConversation, user?.id) : 'Conversation'}</h1>
                <span className="native-chat-sync-label">Sequence {latestSequence}</span>
              </div>
              {status ? <p>{status}</p> : null}
              {error ? <p className="portal-chat-error">{error}</p> : null}
            </header>

            <div className="portal-chat-timeline">
              {messages.map((message) => {
                const mine = message.sender_user_id === user?.id || message.sender_user_id === 'me'
                return (
                  <article key={message.client_message_id || message.id} className={`portal-chat-message ${mine ? 'mine' : ''}`}>
                    <div className="portal-chat-message-meta">
                      <div className="portal-chat-message-author">
                        <span className="portal-avatar portal-chat-message-avatar">
                          {messageAuthor(message, user?.id).slice(0, 1).toUpperCase()}
                        </span>
                        <strong>{messageAuthor(message, user?.id)}</strong>
                      </div>
                      <span>{timestamp(message.created_at)}</span>
                    </div>
                    <p>{message.body}</p>
                    <div className="native-chat-message-footer">
                      {message.sequence ? <span>#{message.sequence}</span> : null}
                      {message.delivery_state === 'pending' ? <span>Sending...</span> : null}
                      {message.delivery_state === 'failed' ? <span className="portal-chat-error">Failed. Retry by sending again.</span> : null}
                    </div>
                  </article>
                )
              })}
              {messages.length === 0 ? <p className="portal-chat-muted">No messages yet.</p> : null}
              <div ref={messagesEndRef} />
            </div>

            <footer className="portal-chat-composer">
              <textarea
                value={draft}
                rows={2}
                placeholder="Write a message"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    sendMessage().catch(() => {})
                  }
                }}
              />
              <button type="button" className="btn-primary" disabled={isSending || !draft.trim()} onClick={() => sendMessage().catch(() => {})}>
                Send
              </button>
            </footer>
          </>
        ) : (
          <div className="portal-chat-empty">
            <h1>Chat</h1>
            <p>{status || 'Select a conversation or open an inbox from a profile.'}</p>
            {error ? <p className="portal-chat-error">{error}</p> : null}
          </div>
        )}
      </div>
    </section>
  )
}
