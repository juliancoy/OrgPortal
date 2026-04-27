import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ClientEvent, EventType, RoomEvent, type MatrixClient, type MatrixEvent } from 'matrix-js-sdk'
import type { ChatMessage, ChatRoomSummary } from '../../../application/ports/ChatService'
import { useAuth, useServices } from '../../../app/AppProviders'
import { bootstrapMatrixSessionFromOrg } from '../../../chat/bootstrapSession'
import { beginMatrixSsoLogin, bootstrapMatrixSessionFromUrl, clearMatrixSession } from '../../../chat/matrixSession'
import { refreshRuntimeTokenFromSession } from '../../../infrastructure/auth/sessionToken'
import {
  buildChatNotificationPayload,
  initChatNotifications,
  notifyChatMessage,
} from '../../../infrastructure/platform/chatNotifications'
import { isNativeCapacitorRuntime } from '../../../infrastructure/platform/runtimePlatform'

const ORG_API_BASE = '/api/org'
const QUICK_REACTIONS = ['👍', '❤️', '🔥', '🎉']
type ReplyMode = 'reply' | 'thread'

type ChatLinkPreview = {
  url: string
  canonical_url: string
  title?: string | null
  description?: string | null
  image_url?: string | null
  site_name?: string | null
  domain?: string | null
}

type ChatLinkPreviewState = {
  status: 'loading' | 'ready' | 'error'
  preview?: ChatLinkPreview
}

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

type OrgEligibleChatRoom = {
  organization_id: string
  organization_name: string
  organization_slug: string
  relationship_status: 'attendee' | 'member' | 'admin'
  room_id: string
  room_alias?: string | null
  room_name?: string | null
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function messageAuthorLabel(message: ChatMessage, myUserId: string | null): string {
  if (myUserId && message.sender === myUserId) return 'You'
  const parts = message.sender.split(':')[0].split('@')
  return parts[1] || message.sender
}

function extractUrlsFromText(value: string): string[] {
  const matches = value.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? []
  const seen = new Set<string>()
  const urls: string[] = []
  for (const raw of matches) {
    const normalized = raw.trim()
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    urls.push(normalized)
    if (urls.length >= 5) break
  }
  return urls
}

export function OrgChatPage() {
  const { role, token } = useAuth()
  const { chatService } = useServices()
  const navigate = useNavigate()
  const { roomId } = useParams()
  const [isLoading, setIsLoading] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [rooms, setRooms] = useState<ChatRoomSummary[]>([])
  const [publicRooms, setPublicRooms] = useState<ChatRoomSummary[]>([])
  const [roomQuery, setRoomQuery] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [linkPreviews, setLinkPreviews] = useState<Record<string, ChatLinkPreviewState>>({})
  const [draft, setDraft] = useState('')
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)
  const [isDraggingMedia, setIsDraggingMedia] = useState(false)
  const [showRoomInfo, setShowRoomInfo] = useState(false)
  const [openMenuMessageId, setOpenMenuMessageId] = useState<string | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null)
  const [replyMode, setReplyMode] = useState<ReplyMode>('reply')
  const [threadRootMessageId, setThreadRootMessageId] = useState<string | null>(null)
  const [bootstrapped, setBootstrapped] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const mediaInputRef = useRef<HTMLInputElement | null>(null)
  const autoJoinAttemptedRef = useRef<Set<string>>(new Set())
  const isNativeRuntime = isNativeCapacitorRuntime()

  const selectedRoomId = roomId || null
  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? publicRooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, publicRooms, selectedRoomId],
  )
  const normalizedRoomQuery = roomQuery.trim().toLowerCase()
  const filteredRooms = useMemo(() => {
    if (!normalizedRoomQuery) return rooms
    return rooms.filter((room) => room.name.toLowerCase().includes(normalizedRoomQuery))
  }, [rooms, normalizedRoomQuery])
  const filteredPublicRooms = useMemo(() => {
    if (!normalizedRoomQuery) return publicRooms
    return publicRooms.filter((room) => room.name.toLowerCase().includes(normalizedRoomQuery))
  }, [publicRooms, normalizedRoomQuery])
  const messagesById = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages])

  useEffect(() => {
    if (selectedRoomId) return
    const firstRoom = rooms[0] ?? publicRooms[0]
    if (!firstRoom) return
    navigate(`/chat/${encodeURIComponent(firstRoom.id)}`, { replace: true })
  }, [selectedRoomId, rooms, publicRooms, navigate])

  useEffect(() => {
    setShowRoomInfo(false)
    setOpenMenuMessageId(null)
    setEditingMessageId(null)
    setEditDraft('')
    setReplyToMessageId(null)
    setReplyMode('reply')
    setThreadRootMessageId(null)
  }, [selectedRoomId])

  useEffect(() => {
    if (!openMenuMessageId) return
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.portal-chat-card-menu')) return
      setOpenMenuMessageId(null)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [openMenuMessageId])

  useEffect(() => {
    if (role === 'guest') {
      navigate('/', { replace: true })
    }
  }, [role, navigate])

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        setIsLoading(true)
        setError(null)
        let session = await bootstrapMatrixSessionFromUrl()
        if (!session && token) {
          try {
            session = await bootstrapMatrixSessionFromOrg(token)
          } catch (err) {
            if (!cancelled) {
              setError(err instanceof Error ? err.message : 'Automatic chat sign-in failed')
            }
          }
        }
        if (!session) {
          if (!cancelled) setBootstrapped(true)
          return
        }
        const client = await chatService.start(session)
        await chatService.verifySession()
        if (cancelled) return
        setMyUserId(client.getUserId())
        setBootstrapped(true)
      } catch (err) {
        clearMatrixSession()
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to initialize Matrix chat')
          setBootstrapped(true)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    init()

    return () => {
      cancelled = true
      chatService.stop()
    }
  }, [token])

  useEffect(() => {
    if (!bootstrapped) return
    let client: MatrixClient
    try {
      client = chatService.getClient()
    } catch {
      return
    }

    let cancelled = false
    async function refreshRooms() {
      try {
        const joined = chatService.listJoinedRooms()
        const discovered = await chatService.listPublicRooms(200)
        let eligibleRooms: OrgEligibleChatRoom[] = []
        {
          try {
            let activeToken = token ?? (await refreshRuntimeTokenFromSession())
            if (activeToken) {
              let eligibilityResp = await fetch(orgUrl('/api/network/chat/rooms'), {
                headers: { Authorization: `Bearer ${activeToken}` },
              })
              if (eligibilityResp.status === 401) {
                const refreshed = await refreshRuntimeTokenFromSession()
                if (refreshed) {
                  activeToken = refreshed
                  eligibilityResp = await fetch(orgUrl('/api/network/chat/rooms'), {
                    headers: { Authorization: `Bearer ${activeToken}` },
                  })
                }
              }
              if (eligibilityResp.ok) {
                const payload = (await eligibilityResp.json()) as OrgEligibleChatRoom[]
                if (Array.isArray(payload)) {
                  eligibleRooms = payload
                }
              }
            }
          } catch {
            // Best-effort enrichment only.
          }
        }
        if (cancelled) return
        if (eligibleRooms.length > 0) {
          const joinedIds = new Set(joined.map((room) => room.id))
          const autoJoinTargets = eligibleRooms
            .map((room) => room?.room_id)
            .filter((id): id is string => Boolean(id))
            .filter((id) => !joinedIds.has(id))
            .filter((id) => !autoJoinAttemptedRef.current.has(id))
          if (autoJoinTargets.length > 0) {
            await Promise.allSettled(
              autoJoinTargets.map(async (id) => {
                autoJoinAttemptedRef.current.add(id)
                await chatService.joinRoom(id)
              }),
            )
            if (!cancelled) {
              const refreshedJoined = chatService.listJoinedRooms()
              setRooms(refreshedJoined)
              const refreshedJoinedIds = new Set(refreshedJoined.map((room) => room.id))
              const refreshDiscovered = await chatService.listPublicRooms(200)
              const discoveredById = new Map(refreshDiscovered.map((room) => [room.id, room]))
              const preferredIds: string[] = []
              for (const room of eligibleRooms) {
                if (!room?.room_id || refreshedJoinedIds.has(room.room_id)) continue
                if (!preferredIds.includes(room.room_id)) preferredIds.push(room.room_id)
                if (!discoveredById.has(room.room_id)) {
                  const statusLabel = room.relationship_status ? ` • ${room.relationship_status}` : ''
                  discoveredById.set(room.room_id, {
                    id: room.room_id,
                    name: `${room.room_name || room.organization_name || room.room_id}${statusLabel}`,
                    unreadCount: 0,
                  })
                }
              }
              const preferredRooms = preferredIds
                .map((roomId) => discoveredById.get(roomId))
                .filter((room): room is ChatRoomSummary => Boolean(room))
              const otherRooms = Array.from(discoveredById.values())
                .filter((room) => !refreshedJoinedIds.has(room.id) && !preferredIds.includes(room.id))
                .sort((a, b) => a.name.localeCompare(b.name))
              setPublicRooms([...preferredRooms, ...otherRooms])
              if (!selectedRoomId && refreshedJoined.length > 0) {
                navigate(`/chat/${encodeURIComponent(refreshedJoined[0].id)}`, { replace: true })
              }
            }
            return
          }
        }
        setRooms(joined)
        const joinedIds = new Set(joined.map((room) => room.id))
        const discoveredById = new Map(discovered.map((room) => [room.id, room]))
        const preferredIds: string[] = []
        for (const room of eligibleRooms) {
          if (!room?.room_id || joinedIds.has(room.room_id)) continue
          if (!preferredIds.includes(room.room_id)) {
            preferredIds.push(room.room_id)
          }
          if (!discoveredById.has(room.room_id)) {
            const statusLabel = room.relationship_status ? ` • ${room.relationship_status}` : ''
            discoveredById.set(room.room_id, {
              id: room.room_id,
              name: `${room.room_name || room.organization_name || room.room_id}${statusLabel}`,
              unreadCount: 0,
            })
          }
        }
        const preferredRooms = preferredIds
          .map((roomId) => discoveredById.get(roomId))
          .filter((room): room is ChatRoomSummary => Boolean(room))
        const otherRooms = Array.from(discoveredById.values())
          .filter((room) => !joinedIds.has(room.id) && !preferredIds.includes(room.id))
          .sort((a, b) => a.name.localeCompare(b.name))
        setPublicRooms([...preferredRooms, ...otherRooms])
        if (!selectedRoomId && joined.length > 0) {
          navigate(`/chat/${encodeURIComponent(joined[0].id)}`, { replace: true })
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load rooms')
      }
    }

    refreshRooms()

    const onRoom = () => {
      refreshRooms().catch(() => {})
    }
    client.on(RoomEvent.MyMembership, onRoom)
    client.on(ClientEvent.Sync, onRoom)
    return () => {
      cancelled = true
      client.off(RoomEvent.MyMembership, onRoom)
      client.off(ClientEvent.Sync, onRoom)
    }
  }, [bootstrapped, selectedRoomId, navigate, token])

  useEffect(() => {
    if (!bootstrapped) {
      setMessages([])
      return
    }

    let client: MatrixClient
    try {
      client = chatService.getClient()
    } catch {
      setMessages([])
      return
    }
    if (!selectedRoomId) {
      setMessages([])
      return
    }

    const load = () => {
      setMessages(chatService.listMessages(selectedRoomId))
    }
    load()

    const onTimeline = (event: MatrixEvent, room: { roomId: string } | undefined, toStartOfTimeline?: boolean) => {
      if (toStartOfTimeline) return
      if (event.getType() !== EventType.RoomMessage) return
      if (!room || room.roomId !== selectedRoomId) return
      load()
    }
    const onSync = () => {
      load()
    }

    client.on(RoomEvent.Timeline, onTimeline)
    client.on(ClientEvent.Sync, onSync)
    return () => {
      client.off(RoomEvent.Timeline, onTimeline)
      client.off(ClientEvent.Sync, onSync)
    }
  }, [selectedRoomId, bootstrapped, chatService])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!isNativeRuntime || !bootstrapped) return
    initChatNotifications().catch(() => {})
  }, [isNativeRuntime, bootstrapped])

  useEffect(() => {
    if (!isNativeRuntime || !bootstrapped) return
    let client: MatrixClient
    try {
      client = chatService.getClient()
    } catch {
      return
    }
    const onTimeline = (event: MatrixEvent, room: { roomId: string; name?: string } | undefined, toStartOfTimeline?: boolean) => {
      if (toStartOfTimeline) return
      if (event.getType() !== EventType.RoomMessage) return
      if (!room?.roomId) return
      if (room.roomId === selectedRoomId && document.visibilityState === 'visible') return
      const payload = buildChatNotificationPayload({
        event,
        roomId: room.roomId,
        roomName: room.name || room.roomId,
        myUserId,
      })
      if (!payload) return
      notifyChatMessage(payload).catch(() => {})
    }
    client.on(RoomEvent.Timeline, onTimeline)
    return () => {
      client.off(RoomEvent.Timeline, onTimeline)
    }
  }, [isNativeRuntime, bootstrapped, chatService, selectedRoomId, myUserId])

  async function handleJoinRoom(nextRoomId: string) {
    try {
      setError(null)
      await chatService.joinRoom(nextRoomId)
      navigate(`/chat/${encodeURIComponent(nextRoomId)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room')
    }
  }

  async function handleSendMessage() {
    const body = draft.trim()
    if (!body || !selectedRoomId) return
    try {
      setError(null)
      if (replyToMessageId) {
        if (replyMode === 'thread') {
          await chatService.sendThreadReplyMessage(
            selectedRoomId,
            threadRootMessageId || replyToMessageId,
            replyToMessageId,
            body,
          )
        } else {
          await chatService.sendReplyMessage(selectedRoomId, replyToMessageId, body)
        }
      } else {
        await chatService.sendTextMessage(selectedRoomId, body)
      }
      setDraft('')
      setReplyToMessageId(null)
      setReplyMode('reply')
      setThreadRootMessageId(null)
      setMessages(chatService.listMessages(selectedRoomId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    }
  }

  async function handleReact(eventId: string, emoji: string) {
    if (!selectedRoomId) return
    try {
      setError(null)
      await chatService.sendReaction(selectedRoomId, eventId, emoji)
      setMessages(chatService.listMessages(selectedRoomId))
      setOpenMenuMessageId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reaction')
    }
  }

  function startReply(messageId: string) {
    setReplyToMessageId(messageId)
    setReplyMode('reply')
    setThreadRootMessageId(null)
    setOpenMenuMessageId(null)
  }

  function startThreadReply(message: ChatMessage) {
    setReplyToMessageId(message.id)
    setReplyMode('thread')
    setThreadRootMessageId(message.threadRootEventId || message.id)
    setOpenMenuMessageId(null)
  }

  function startEdit(message: ChatMessage) {
    if ((message.messageType ?? 'text') !== 'text') return
    setEditingMessageId(message.id)
    setEditDraft(message.body)
    setOpenMenuMessageId(null)
  }

  async function handleSaveEdit(messageId: string) {
    if (!selectedRoomId) return
    const body = editDraft.trim()
    if (!body) return
    try {
      setError(null)
      await chatService.editMessage(selectedRoomId, messageId, body)
      setEditingMessageId(null)
      setEditDraft('')
      setMessages(chatService.listMessages(selectedRoomId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to edit message')
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!selectedRoomId) return
    try {
      setError(null)
      await chatService.deleteMessage(selectedRoomId, messageId)
      setOpenMenuMessageId(null)
      setMessages(chatService.listMessages(selectedRoomId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete message')
    }
  }

  async function handleMediaUpload(file: File | null) {
    if (!selectedRoomId || !file) return
    try {
      setError(null)
      setIsUploadingMedia(true)
      await chatService.sendMediaMessage(selectedRoomId, file)
      setMessages(chatService.listMessages(selectedRoomId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send media')
    } finally {
      setIsUploadingMedia(false)
      if (mediaInputRef.current) {
        mediaInputRef.current.value = ''
      }
    }
  }

  useEffect(() => {
    if (!selectedRoomId || messages.length === 0) return
    const urls = Array.from(
      new Set(
        messages
          .filter((message) => (message.messageType ?? 'text') === 'text')
          .flatMap((message) => extractUrlsFromText(message.body)),
      ),
    ).slice(0, 30)
    if (urls.length === 0) return

    const urlsToFetch = urls.filter((url) => !linkPreviews[url])
    if (urlsToFetch.length === 0) return

    setLinkPreviews((prev) => {
      const next = { ...prev }
      for (const url of urlsToFetch) {
        if (!next[url]) next[url] = { status: 'loading' }
      }
      return next
    })

    let cancelled = false
    async function fetchPreviews() {
      let activeToken = token ?? null
      if (!activeToken) {
        activeToken = await refreshRuntimeTokenFromSession()
      }
      for (const url of urlsToFetch) {
        if (cancelled) break
        try {
          if (!activeToken) {
            throw new Error('No session token available for link preview')
          }
          let response = await fetch(`${orgUrl('/api/network/chat/link-preview')}?url=${encodeURIComponent(url)}`, {
            headers: { Authorization: `Bearer ${activeToken}` },
          })
          if (response.status === 401) {
            const refreshed = await refreshRuntimeTokenFromSession()
            if (refreshed) {
              activeToken = refreshed
              response = await fetch(`${orgUrl('/api/network/chat/link-preview')}?url=${encodeURIComponent(url)}`, {
                headers: { Authorization: `Bearer ${activeToken}` },
              })
            }
          }
          if (!response.ok) {
            throw new Error(`Preview unavailable (${response.status})`)
          }
          const payload = (await response.json()) as ChatLinkPreview
          if (cancelled) break
          setLinkPreviews((prev) => ({
            ...prev,
            [url]: { status: 'ready', preview: payload },
          }))
        } catch {
          if (cancelled) break
          setLinkPreviews((prev) => ({
            ...prev,
            [url]: { status: 'error' },
          }))
        }
      }
    }
    fetchPreviews().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [messages, selectedRoomId, token])

  if (isLoading) {
    return <section className="portal-chat-shell"><p className="portal-chat-status">Loading chat...</p></section>
  }

  let hasSession = true
  try {
    chatService.getClient()
  } catch {
    hasSession = false
  }

  if (!hasSession) {
    return (
      <section className="portal-chat-shell">
        <div className="portal-chat-empty">
          <h1>Org Chat</h1>
          <p>Automatic sign-in was unavailable. Connect Matrix manually.</p>
          <button
            type="button"
            className="btn-primary portal-chat-connect-btn"
            disabled={isConnecting}
            onClick={() => {
              setIsConnecting(true)
              beginMatrixSsoLogin(window.location.href)
            }}
          >
            {isConnecting ? 'Redirecting...' : 'Connect Chat'}
          </button>
          {error ? <p className="portal-chat-error">{error}</p> : null}
        </div>
      </section>
    )
  }

  return (
    <section className="portal-chat-shell">
      <aside className="portal-chat-sidebar">
        <label className="portal-chat-search-label" htmlFor="chat-room-search">
          Filter rooms
        </label>
        <input
          id="chat-room-search"
          className="portal-chat-search-input"
          type="search"
          placeholder="Filter Joined + Discover"
          value={roomQuery}
          onChange={(event) => setRoomQuery(event.target.value)}
        />
        <div className="portal-chat-sidebar-header">
          <h2>Rooms</h2>
          <Link to="/chat" className="portal-chat-home-link">
            Reset
          </Link>
        </div>
        <div className="portal-chat-room-groups">
          <div>
            <p className="portal-chat-group-title">Joined</p>
            <ul className="portal-chat-room-list">
              {filteredRooms.map((room) => (
                <li key={room.id}>
                  <button
                    type="button"
                    className={`portal-chat-room-btn ${room.id === selectedRoomId ? 'active' : ''}`}
                    onClick={() => navigate(`/chat/${encodeURIComponent(room.id)}`)}
                  >
                    <span>{room.name}</span>
                    <small>{room.id}</small>
                    {room.unreadCount > 0 ? <span className="portal-chat-unread">{room.unreadCount}</span> : null}
                  </button>
                </li>
              ))}
              {filteredRooms.length === 0 ? <li className="portal-chat-muted">No joined rooms.</li> : null}
            </ul>
          </div>

          <div>
            <p className="portal-chat-group-title">Discover</p>
            <ul className="portal-chat-room-list">
              {filteredPublicRooms.slice(0, 25).map((room) => (
                <li key={room.id}>
                  <button type="button" className="portal-chat-room-btn discover" onClick={() => handleJoinRoom(room.id)}>
                    <span>{room.name}</span>
                    <small>Join room</small>
                  </button>
                </li>
              ))}
              {filteredPublicRooms.length === 0 ? <li className="portal-chat-muted">No public rooms found.</li> : null}
            </ul>
          </div>
        </div>
      </aside>

      <div
        className={`portal-chat-main ${isDraggingMedia ? 'drag-over' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setIsDraggingMedia(true)
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
          setIsDraggingMedia(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setIsDraggingMedia(false)
          const file = event.dataTransfer.files?.[0] ?? null
          handleMediaUpload(file).catch(() => {})
        }}
      >
        {selectedRoom ? (
          <>
            <header className="portal-chat-room-header">
              <div className="portal-chat-room-header-row">
                <h1>{selectedRoom.name}</h1>
                <button
                  type="button"
                  className="portal-chat-info-btn"
                  onClick={() => setShowRoomInfo((current) => !current)}
                >
                  {showRoomInfo ? 'Hide Info' : 'Info'}
                </button>
              </div>
              {showRoomInfo ? <p>{selectedRoom.id}</p> : null}
            </header>

            <div className="portal-chat-timeline">
              {messages.map((message) => {
                const mine = Boolean(myUserId && message.sender === myUserId)
                const repliedTo = message.replyToEventId ? messagesById.get(message.replyToEventId) : null
                const threadRoot = message.threadRootEventId ? messagesById.get(message.threadRootEventId) : null
                return (
                  <article key={message.id} className={`portal-chat-message ${mine ? 'mine' : ''}`}>
                    <div className="portal-chat-card-menu">
                      <button
                        type="button"
                        className="portal-chat-menu-trigger"
                        aria-label="Message actions"
                        aria-expanded={openMenuMessageId === message.id}
                        onClick={() => setOpenMenuMessageId((current) => (current === message.id ? null : message.id))}
                      >
                        ⋮
                      </button>
                      {openMenuMessageId === message.id ? (
                        <div className="portal-chat-action-menu">
                          <div className="portal-chat-action-menu-label">React</div>
                          <div className="portal-chat-reaction-picker">
                            {QUICK_REACTIONS.map((emoji) => (
                              <button
                                key={`${message.id}-${emoji}`}
                                type="button"
                                className="portal-chat-reaction-btn"
                                onClick={() => handleReact(message.id, emoji).catch(() => {})}
                                title={`React with ${emoji}`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                          <button type="button" className="portal-chat-action-item" onClick={() => startReply(message.id)}>
                            Reply
                          </button>
                          <button type="button" className="portal-chat-action-item" onClick={() => startThreadReply(message)}>
                            Reply in thread
                          </button>
                          {(message.messageType ?? 'text') === 'text' && mine ? (
                            <button type="button" className="portal-chat-action-item" onClick={() => startEdit(message)}>
                              Edit
                            </button>
                          ) : null}
                          {mine ? (
                            <button
                              type="button"
                              className="portal-chat-action-item danger"
                              onClick={() => handleDeleteMessage(message.id).catch(() => {})}
                            >
                              Delete
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="portal-chat-action-item"
                            onClick={() => {
                              navigator.clipboard?.writeText(message.id).catch(() => {})
                              setOpenMenuMessageId(null)
                            }}
                          >
                            Copy Message ID
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="portal-chat-message-meta">
                      <strong>{messageAuthorLabel(message, myUserId)}</strong>
                      <span>{formatTimestamp(message.ts)}</span>
                    </div>
                    {threadRoot ? (
                      <div className="portal-chat-thread-context">
                        Thread: {messageAuthorLabel(threadRoot, myUserId)}: {threadRoot.body.slice(0, 80)}
                      </div>
                    ) : null}
                    {repliedTo ? (
                      <div className="portal-chat-reply-context">
                        Replying to {messageAuthorLabel(repliedTo, myUserId)}: {repliedTo.body.slice(0, 80)}
                      </div>
                    ) : null}
                    {message.messageType === 'image' && message.mediaUrl ? (
                      <img className="portal-chat-media-image" src={message.mediaUrl} alt={message.mediaFileName || message.body} />
                    ) : null}
                    {message.messageType === 'file' ? (
                      <a className="portal-chat-media-file" href={message.mediaUrl} target="_blank" rel="noreferrer">
                        {message.mediaFileName || message.body}
                      </a>
                    ) : editingMessageId === message.id ? (
                      <div className="portal-chat-edit-box">
                        <textarea
                          value={editDraft}
                          onChange={(event) => setEditDraft(event.target.value)}
                          rows={3}
                        />
                        <div className="portal-chat-edit-actions">
                          <button type="button" className="btn-primary" onClick={() => handleSaveEdit(message.id).catch(() => {})}>
                            Save
                          </button>
                          <button
                            type="button"
                            className="portal-chat-attach-btn"
                            onClick={() => {
                              setEditingMessageId(null)
                              setEditDraft('')
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p>
                        {message.body}
                        {message.edited ? <span className="portal-chat-edited-mark"> (edited)</span> : null}
                      </p>
                    )}
                    {(message.messageType ?? 'text') === 'text'
                      ? extractUrlsFromText(message.body).map((url) => {
                          const preview = linkPreviews[url]
                          if (!preview || preview.status !== 'ready' || !preview.preview) return null
                          const item = preview.preview
                          return (
                            <a
                              key={`${message.id}-preview-${url}`}
                              className="portal-chat-link-preview"
                              href={item.canonical_url || item.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {item.image_url ? (
                                <img src={item.image_url} alt={item.title || item.site_name || 'Link preview'} />
                              ) : null}
                              <div className="portal-chat-link-preview-body">
                                <strong>{item.title || item.site_name || item.domain || url}</strong>
                                {item.description ? <p>{item.description}</p> : null}
                                <small>{item.site_name || item.domain || item.canonical_url || item.url}</small>
                              </div>
                            </a>
                          )
                        })
                      : null}
                    <div className="portal-chat-message-actions">
                      {(message.reactions ?? []).length > 0 ? (
                        <div className="portal-chat-reaction-summary">
                          {(message.reactions ?? []).map((reaction) => (
                            <span key={`${message.id}-count-${reaction.key}`} className="portal-chat-reaction-chip">
                              {reaction.key} {reaction.count}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </article>
                )
              })}
              {messages.length === 0 ? <p className="portal-chat-muted">No messages yet.</p> : null}
              <div ref={messagesEndRef} />
            </div>

            <footer className="portal-chat-composer">
              {replyToMessageId && messagesById.get(replyToMessageId) ? (
                <div className="portal-chat-reply-banner">
                  {replyMode === 'thread' ? 'Replying in thread to ' : 'Replying to '}
                  {messageAuthorLabel(messagesById.get(replyToMessageId) as ChatMessage, myUserId)}:{' '}
                  {(messagesById.get(replyToMessageId) as ChatMessage).body.slice(0, 90)}
                  <button
                    type="button"
                    onClick={() => {
                      setReplyToMessageId(null)
                      setReplyMode('reply')
                      setThreadRootMessageId(null)
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
              <div className="portal-chat-composer-actions">
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip,.csv"
                  className="portal-chat-media-input"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null
                    handleMediaUpload(file).catch(() => {})
                  }}
                />
                <button
                  type="button"
                  className="portal-chat-attach-btn"
                  disabled={isUploadingMedia}
                  onClick={() => mediaInputRef.current?.click()}
                >
                  {isUploadingMedia ? 'Uploading…' : 'Attach'}
                </button>
              </div>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write a message..."
                rows={3}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    handleSendMessage().catch(() => {})
                  }
                }}
              />
              <button type="button" className="btn-primary" onClick={() => handleSendMessage().catch(() => {})}>
                Send
              </button>
            </footer>
          </>
        ) : (
          <div className="portal-chat-empty">
            <h1>Select a room</h1>
            <p>Choose a joined room or join one from Discover.</p>
          </div>
        )}
      </div>

      {error ? <p className="portal-chat-error">{error}</p> : null}
    </section>
  )
}
