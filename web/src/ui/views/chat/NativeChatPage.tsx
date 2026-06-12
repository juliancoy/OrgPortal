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
type ConversationMember = NonNullable<NativeChatConversation['members']>[number]

type NetworkUser = {
  user_id: string
  user_name: string
  contact_slug?: string | null
  contact_enabled?: boolean
  headline?: string | null
  photo_url?: string | null
}

function timestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function conversationParticipant(conversation: NativeChatConversation, myUserId?: string | null): ConversationMember | null {
  return (
    (conversation.members || []).find((member) => member.user_id !== myUserId) ||
    (conversation.members || []).find((member) => member.user_id === myUserId) ||
    null
  )
}

function conversationLabel(conversation: NativeChatConversation, myUserId?: string | null): string {
  if (conversation.kind !== 'dm' && conversation.title?.trim()) return conversation.title.trim()
  const participant = conversationParticipant(conversation, myUserId)
  if (participant?.user_name?.trim()) {
    const label = participant.user_name.trim()
    return participant.user_id === myUserId ? `${label} (you)` : label
  }
  if (conversation.kind === 'dm') return 'Conversation'
  if (conversation.title?.trim()) return conversation.title.trim()
  return conversation.id
}

function messageAuthor(message: NativeChatMessage, myUserId?: string | null): string {
  if (myUserId && message.sender_user_id === myUserId) return 'You'
  return message.sender_name?.trim() || message.sender_user_id
}

function avatarInitial(label: string): string {
  return label.trim().slice(0, 1).toUpperCase() || '?'
}

function conversationAvatarUrl(conversation: NativeChatConversation, myUserId?: string | null): string {
  return conversationParticipant(conversation, myUserId)?.avatar_url?.trim() || ''
}

function conversationMemberByUserId(
  conversation: NativeChatConversation | null,
  userId?: string | null,
): ConversationMember | null {
  if (!conversation || !userId) return null
  return (conversation.members || []).find((member) => member.user_id === userId) || null
}

function conversationRecency(conversation: NativeChatConversation): number {
  const value = conversation.last_message_at || conversation.last_message?.created_at || conversation.updated_at
  const parsed = new Date(value || 0).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function sortConversationsByRecency(rows: NativeChatConversation[]): NativeChatConversation[] {
  return [...rows].sort((a, b) => conversationRecency(b) - conversationRecency(a))
}

function renderAvatar(label: string, imageUrl?: string | null) {
  return imageUrl ? <img src={imageUrl} alt={label} /> : avatarInitial(label)
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
  const [people, setPeople] = useState<NetworkUser[]>([])
  const [messages, setMessages] = useState<MessageState[]>([])
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState('Loading chat...')
  const [error, setError] = useState<string | null>(null)
  const latestSequenceRef = useRef(0)
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('idle')
  const [isSending, setIsSending] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const timelineRef = useRef<HTMLDivElement | null>(null)
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
  const currentUserAvatarUrl = useMemo(() => {
    if (!user?.id) return ''
    return selectedConversation?.members?.find((member) => member.user_id === user.id)?.avatar_url?.trim() || ''
  }, [selectedConversation, user])
  const sociablePeople = useMemo(
    () =>
      people
        .filter((person) => person.user_id !== user?.id && person.contact_slug && person.contact_enabled !== false)
        .sort((a, b) => a.user_name.localeCompare(b.user_name)),
    [people, user],
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
    const sorted = sortConversationsByRecency(rows)
    setConversations(sorted)
    return sorted
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
              return sortConversationsByRecency([conversation, ...next])
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
    if (!token) {
      setPeople([])
      return
    }
    let cancelled = false
    fetch('/api/org/api/network/users?limit=1000&sort=recent', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text().catch(() => 'Failed to load people'))
        return response.json() as Promise<NetworkUser[]>
      })
      .then((rows) => {
        if (!cancelled) setPeople(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setPeople([])
      })
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!roomId) {
      setMessages([])
      latestSequenceRef.current = 0
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
        setMessages(
          payload.messages
            .map((message) => ({ ...message, delivery_state: 'confirmed' }) satisfies MessageState)
            .sort(
              (a, b) =>
                Number(a.sequence || Number.MAX_SAFE_INTEGER) - Number(b.sequence || Number.MAX_SAFE_INTEGER) ||
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            ),
        )
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
            const last = payload.messages.at(-1)
            if (last?.id) api.markRead(activeRoomId, last.id).catch(() => {})
            refreshConversations().catch(() => {})
          } else {
            latestSequenceRef.current = payload.latest_sequence || latestSequenceRef.current
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
    const timeline = timelineRef.current
    if (!timeline) return
    timeline.scrollTo({ top: timeline.scrollHeight, left: 0, behavior: 'auto' })
    window.scrollTo({ top: window.scrollY, left: 0, behavior: 'auto' })
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

  async function startConversationWith(person: NetworkUser) {
    if (!person.contact_slug) return
    try {
      setError(null)
      setStatus(`Opening chat with ${person.user_name}...`)
      const conversation = await api.startDm(person.contact_slug)
      setConversations((current) => {
        const next = current.filter((item) => item.id !== conversation.id)
        return sortConversationsByRecency([conversation, ...next])
      })
      navigate(`/chat/${encodeURIComponent(conversation.id)}`)
    } catch (err) {
      setError(toUserFacingErrorMessage(err, `Failed to open chat with ${person.user_name}`))
    } finally {
      setStatus('')
    }
  }

  return (
    <section className={`portal-chat-shell native-chat-shell ${sidebarExpanded ? 'sidebar-expanded' : ''}`}>
      <aside className="portal-chat-sidebar native-chat-sidebar">
        <div className="portal-chat-sidebar-header">
          <h2>Conversations</h2>
          <button
            type="button"
            className="native-chat-sidebar-toggle"
            aria-label={sidebarExpanded ? 'Collapse conversations' : 'Expand conversations'}
            aria-expanded={sidebarExpanded}
            onClick={() => setSidebarExpanded((expanded) => !expanded)}
          >
            {sidebarExpanded ? '<' : '>'}
          </button>
          <Link to="/chat" className="portal-chat-home-link">Reset</Link>
        </div>
        <ul className="portal-chat-room-list">
          {conversations.map((conversation) => {
            const label = conversationLabel(conversation, user?.id)
            const avatarUrl = conversationAvatarUrl(conversation, user?.id)
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  className={`portal-chat-room-btn ${conversation.id === roomId ? 'active' : ''}`}
                  title={label}
                  onClick={() => navigate(`/chat/${encodeURIComponent(conversation.id)}`)}
                >
                  <span className="portal-chat-room-label">
                    <span className="portal-avatar portal-chat-room-avatar">
                      {renderAvatar(label, avatarUrl)}
                    </span>
                    <span className="native-chat-room-name">{label}</span>
                  </span>
                  {conversation.unread_count ? <span className="portal-chat-unread">{conversation.unread_count}</span> : null}
                </button>
              </li>
            )
          })}
          {conversations.length === 0 ? <li className="portal-chat-muted">No conversations yet.</li> : null}
        </ul>
        <section className="native-chat-sociable" aria-label="Be Sociable">
          <h3>Be Sociable!</h3>
          <ul className="portal-chat-room-list native-chat-people-list">
            {sociablePeople.map((person) => (
              <li key={person.user_id}>
                <button
                  type="button"
                  className="portal-chat-room-btn native-chat-person-btn"
                  title={person.user_name}
                  onClick={() => startConversationWith(person).catch(() => {})}
                >
                  <span className="portal-chat-room-label">
                    <span className="portal-avatar portal-chat-room-avatar">
                      {renderAvatar(person.user_name, person.photo_url)}
                    </span>
                    <span className="native-chat-person-copy">
                      <span className="native-chat-room-name">{person.user_name}</span>
                      {person.headline ? <small>{person.headline}</small> : null}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {sociablePeople.length === 0 ? <li className="portal-chat-muted">No people available.</li> : null}
          </ul>
        </section>
      </aside>

      <div className="portal-chat-main">
        {roomId ? (
          <>
            <header className="portal-chat-room-header">
              <div className="portal-chat-room-header-row">
                <div className="native-chat-room-title">
                  {selectedConversation ? (
                    <span className="portal-avatar portal-chat-room-avatar">
                      {renderAvatar(
                        conversationLabel(selectedConversation, user?.id),
                        conversationAvatarUrl(selectedConversation, user?.id),
                      )}
                    </span>
                  ) : null}
                  <h1>{selectedConversation ? conversationLabel(selectedConversation, user?.id) : 'Conversation'}</h1>
                </div>
              </div>
              {status ? <p>{status}</p> : null}
              {error ? <p className="portal-chat-error">{error}</p> : null}
            </header>

            <div className="portal-chat-timeline" ref={timelineRef}>
              {messages.map((message, index) => {
                const mine = message.sender_user_id === user?.id || message.sender_user_id === 'me'
                const previous = messages[index - 1]
                const groupedWithPrevious =
                  Boolean(previous) &&
                  previous.sender_user_id === message.sender_user_id &&
                  Math.abs(new Date(message.created_at).getTime() - new Date(previous.created_at).getTime()) < 5 * 60 * 1000
                const authorLabel = messageAuthor(message, user?.id)
                const senderMember = conversationMemberByUserId(selectedConversation, message.sender_user_id)
                const avatarUrl = mine ? currentUserAvatarUrl : senderMember?.avatar_url?.trim() || ''
                return (
                  <article
                    key={message.client_message_id || message.id}
                    className={`portal-chat-message ${mine ? 'mine' : ''} ${groupedWithPrevious ? 'grouped' : ''}`}
                  >
                    {!mine ? (
                      <span className="portal-avatar portal-chat-message-side-avatar">
                        {renderAvatar(authorLabel, avatarUrl)}
                      </span>
                    ) : null}
                    <div className="portal-chat-message-meta" aria-hidden={groupedWithPrevious}>
                      <div className="portal-chat-message-author">
                        <span className="portal-avatar portal-chat-message-avatar">
                          {renderAvatar(authorLabel, avatarUrl)}
                        </span>
                        <strong>{authorLabel}</strong>
                      </div>
                      <span>{timestamp(message.created_at)}</span>
                    </div>
                    <p>{message.body}</p>
                    <div className="native-chat-message-footer">
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
