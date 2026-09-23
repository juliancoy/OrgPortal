import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CalendarPlus, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, MapPinned, X } from 'lucide-react'
import { setSeoMeta, upsertJsonLd } from '../../utils/seo'
import { downloadIcsEvent, outlookCalendarUrl } from '../../utils/calendar'
import { useAuth } from '../../../app/AppProviders'
import { NativeChatApi, type NativeChatMessage, type NativeChatReaction } from '../../../chat/nativeChatApi'
import { refreshRuntimeTokenFromSession } from '../../../infrastructure/auth/sessionToken'
import { pidpAppLoginUrl } from '../../../config/pidp'
import { EventRegistration } from './EventRegistration'
import { EventPosterTools } from '../../components/EventPosterTools'
import { toUserFacingErrorMessage } from '../../../infrastructure/http/userFacingError'
import { loadGoogleCalendarConnection, savePortalEventToGoogleCalendar } from '../googleCalendarApi'
import { loadMicrosoftCalendarConnection, savePortalEventToMicrosoftCalendar } from '../microsoftCalendarApi'

const ORG_API_BASE = '/api/org'
const QUICK_REACTIONS = ['👍', '❤️', '🔥', '🎉']

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

type PublicEvent = {
  id: string
  title: string
  slug: string
  updated_at?: string | null
  description?: string | null
  starts_at?: string | null
  ends_at?: string | null
  location?: string | null
  source_url?: string | null
  image_url?: string | null
  media?: EventMediaItem[]
  organization_name?: string | null
  organization_slug?: string | null
  organization_image_url?: string | null
  host_org_name?: string | null
  host_org_id?: string | null
  host_user_id?: string | null
}

type EventMediaItem = {
  id: string
  url: string
  label: string
  alt: string
  kind: 'image'
}

type PublicEventChat = {
  event_slug: string
  room_exists: boolean
  conversation_id?: string | null
  room_name?: string | null
  messages?: unknown[]
}

function toLocalDateTime(value?: string | null) {
  if (!value) return 'TBD'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return 'TBD'
  return dt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function toEventDate(value?: string | null) {
  if (!value) return 'Date TBD'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return 'Date TBD'
  return dt.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function toEventTimeRange(start?: string | null, end?: string | null) {
  if (!start) return 'Time TBD'
  const startDate = new Date(start)
  if (Number.isNaN(startDate.getTime())) return 'Time TBD'
  const startText = startDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (!end) return startText
  const endDate = new Date(end)
  if (Number.isNaN(endDate.getTime())) return startText
  return `${startText} to ${endDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

function eventUrl(slug: string) {
  return `${window.location.origin}/events/${encodeURIComponent(slug)}`
}

function googleMapsUrl(location: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
}

function googleMapsEmbedUrl(location: string) {
  return `https://www.google.com/maps?q=${encodeURIComponent(location)}&output=embed`
}

function summary(text?: string | null) {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'Event details and schedule on Org Portal.'
  return cleaned.length > 280 ? `${cleaned.slice(0, 277)}...` : cleaned
}

function getEventOrganizerName(event: PublicEvent) {
  const candidate = event.organization_name || event.host_org_name
  return candidate?.trim() || 'Code Collective'
}

function organizationInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || '?'
}

function getEventOfferValidFrom(event: PublicEvent) {
  const start = event.starts_at ? new Date(event.starts_at) : null
  if (start && !Number.isNaN(start.getTime())) {
    const now = new Date()
    return (start.getTime() < now.getTime() ? start : now).toISOString()
  }
  return new Date().toISOString()
}

function messageAuthorLabel(message: NativeChatMessage, myUserId: string | null): string {
  if (myUserId && message.sender_user_id === myUserId) return 'You'
  return message.sender_name?.trim() || message.sender_user_id || 'Member'
}

function messageAuthorInitial(message: NativeChatMessage, myUserId: string | null): string {
  const label = messageAuthorLabel(message, myUserId).trim()
  return (label[0] || '?').toUpperCase()
}

function usedReactions(message: NativeChatMessage) {
  return (message.reactions || []).filter((reaction) => reaction.count > 0)
}

function reactionOwnerLabel(reaction: NativeChatReaction) {
  const names = (reaction.users || [])
    .map((owner) => owner.user_name?.trim() || owner.user_id)
    .filter(Boolean)
  if (names.length === 0) return 'No reactions yet'
  return names.join(', ')
}

function reactionOwnerSummary(reaction: NativeChatReaction) {
  const names = (reaction.users || [])
    .map((owner) => owner.user_name?.trim() || owner.user_id)
    .filter(Boolean)
  if (names.length === 0) return ''
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}

function CommentAvatar({ message, myUserId }: { message: NativeChatMessage; myUserId: string | null }) {
  return (
    <div className="public-event-comment-avatar" aria-hidden="true">
      {message.sender_avatar_url ? (
        <img src={message.sender_avatar_url} alt="" loading="lazy" />
      ) : (
        messageAuthorInitial(message, myUserId)
      )}
    </div>
  )
}

function ReactionControls({
  message,
  disabled,
  onReact,
}: {
  message: NativeChatMessage
  disabled: boolean
  onReact: (messageId: string, emoji: string) => void
}) {
  const reactions = usedReactions(message)
  return (
    <div className="public-event-comment-tools">
      {reactions.map((reaction) => (
        <button
          key={`${message.id}-${reaction.key}`}
          type="button"
          onClick={() => onReact(message.id, reaction.key)}
          disabled={disabled}
          aria-label={`${reaction.reacted ? 'Remove' : 'React with'} ${reaction.key}. Reacted by ${reactionOwnerLabel(reaction)}`}
          aria-pressed={Boolean(reaction.reacted)}
          className={reaction.reacted ? 'public-event-comment-reaction-active' : undefined}
          title={`Reacted by ${reactionOwnerLabel(reaction)}`}
        >
          <span>{reaction.key} {reaction.count}</span>
          <small>{reactionOwnerSummary(reaction)}</small>
        </button>
      ))}
      <details className="public-event-comment-react-menu">
        <summary>React</summary>
        <div>
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={`${message.id}-add-${emoji}`}
              type="button"
              onClick={() => onReact(message.id, emoji)}
              disabled={disabled}
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </details>
    </div>
  )
}

function messageTime(message: NativeChatMessage) {
  return new Date(message.created_at).getTime()
}

function uuid() {
  if ('crypto' in window && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID()
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function PublicEventPage() {
  const { token, user, isLoading: authLoading } = useAuth()
  const { slug } = useParams()
  const [event, setEvent] = useState<PublicEvent | null>(null)
  const [status, setStatus] = useState<string>('Loading event…')
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false)
  const [microsoftCalendarConnected, setMicrosoftCalendarConnected] = useState(false)
  const [eventChat, setEventChat] = useState<PublicEventChat | null>(null)
  const [eventChatMessages, setEventChatMessages] = useState<NativeChatMessage[]>([])
  const [eventChatReady, setEventChatReady] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
  const [chatStatus, setChatStatus] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [chatActionPending, setChatActionPending] = useState(false)
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [canManageEvent, setCanManageEvent] = useState(false)
  const [addressCopied, setAddressCopied] = useState(false)
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(-1)
  const chatApi = useMemo(
    () =>
      new NativeChatApi(async () => {
        return token || (await refreshRuntimeTokenFromSession())
      }),
    [token],
  )

  useEffect(() => {
    if (!slug) return
    const canonical = eventUrl(slug)
    setSeoMeta({
      title: `Event • ${slug}`,
      description: 'Event details on Org Portal.',
      canonicalUrl: canonical,
      type: 'article',
    })
  }, [slug])

  useEffect(() => {
    if (authLoading) return
    if (!token) {
      setGoogleCalendarConnected(false)
      setMicrosoftCalendarConnected(false)
      return
    }
    Promise.allSettled([loadGoogleCalendarConnection(token), loadMicrosoftCalendarConnection(token)])
      .then(([googleResult, microsoftResult]) => {
        setGoogleCalendarConnected(googleResult.status === 'fulfilled' ? Boolean(googleResult.value.connected) : false)
        setMicrosoftCalendarConnected(microsoftResult.status === 'fulfilled' ? Boolean(microsoftResult.value.connected) : false)
      })
      .catch(() => {
        setGoogleCalendarConnected(false)
        setMicrosoftCalendarConnected(false)
      })
  }, [authLoading, token])

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    setEvent(null)
    setStatus('Loading event…')
    fetch(orgUrl(`/api/network/events/public/${encodeURIComponent(slug)}`))
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Event not found (${resp.status})`)
        }
        return resp.json() as Promise<PublicEvent>
      })
      .then((data) => {
        if (cancelled) return
        setEvent({ ...data, media: data.media?.map((item) => ({
          ...item,
          url: item.url.startsWith('/api/network/') ? orgUrl(item.url) : item.url,
        })) })
        setStatus('')
      })
      .catch((err) => {
        if (cancelled) return
        setEvent(null)
        setStatus(toUserFacingErrorMessage(err, 'Event unavailable'))
      })
    return () => { cancelled = true }
  }, [slug])

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    setChatLoading(true)
    setChatStatus('')
    fetch(orgUrl(`/api/network/events/public/${encodeURIComponent(slug)}/chat`))
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Event chat unavailable (${resp.status})`)
        }
        return (await resp.json()) as PublicEventChat
      })
      .then((payload) => {
        if (cancelled) return
        setEventChat(payload)
      })
      .catch((err) => {
        if (cancelled) return
        setEventChat(null)
        setChatStatus(toUserFacingErrorMessage(err, 'Event chat unavailable'))
      })
      .finally(() => {
        if (cancelled) return
        setChatLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    const activeToken = (token || '').trim()
    let cancelled = false
    setEventChatReady(false)
    setMyUserId(null)
    setReplyingToId(null)
    setReplyDrafts({})
    if (authLoading) return
    if (!activeToken || !event || !eventChat?.room_exists) return

    const currentEvent = event
    async function initEventComments() {
      try {
        setChatStatus('Connecting to event comments...')
        const conversation = await chatApi.startEventRoom({
          eventId: currentEvent.id,
          title: eventChat?.room_name || `${currentEvent.title} Comments`,
          orgId: currentEvent.host_org_id || null,
        })
        if (cancelled) return
        setEventChat((current) => current ? { ...current, conversation_id: conversation.id, room_name: conversation.title || current.room_name } : current)
        setMyUserId(user?.id || null)
        setEventChatReady(true)
        setChatStatus('')
        const initialMessages = await chatApi.listMessages(conversation.id)
        if (!cancelled) setEventChatMessages(initialMessages.messages || [])
      } catch (err) {
        if (cancelled) return undefined
        setEventChatReady(false)
        setChatStatus(toUserFacingErrorMessage(err, 'Event comments unavailable'))
      }
    }

    initEventComments()
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [authLoading, chatApi, event, eventChat?.room_exists, token, user?.id])

  useEffect(() => {
    if (!event) return
    setSeoMeta({
      title: `${event.title} • Org Portal`,
      description: summary(event.description),
      canonicalUrl: eventUrl(event.slug),
      imageUrl: event.image_url || undefined,
      type: 'article',
    })
  }, [event])

  useEffect(() => {
    let cancelled = false
    setCanManageEvent(false)
    if (authLoading || !event || !token) return

    async function checkEventManagerAccess() {
      try {
        const adminCheck = fetch(orgUrl('/admin/me'), {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((resp) => (resp.ok ? resp.json() : { is_sysadmin: false }))
          .catch(() => ({ is_sysadmin: false }))

        const orgCheck = event?.host_org_id
          ? fetch(orgUrl('/api/network/orgs?mine=true&limit=300'), {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then(async (resp) => {
                if (!resp.ok) return []
                const data = await resp.json()
                return Array.isArray(data) ? data : []
              })
              .catch(() => [])
          : Promise.resolve([])

        const [adminData, orgRows] = await Promise.all([adminCheck, orgCheck])
        if (cancelled) return
        const isSysadmin = Boolean((adminData as { is_sysadmin?: boolean }).is_sysadmin)
        const managesHostOrg = (orgRows as Array<{ id?: string; my_role?: string | null }>).some((org) => (
          org.id === event?.host_org_id && (org.my_role === 'owner' || org.my_role === 'administrator')
        ))
        const managesIndividualEvent = Boolean(event?.host_user_id && user?.id && event.host_user_id === user.id)
        setCanManageEvent(isSysadmin || managesHostOrg || managesIndividualEvent)
      } catch {
        if (!cancelled) setCanManageEvent(false)
      }
    }

    checkEventManagerAccess().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [authLoading, event, token, user?.id])

  const eventJsonLd = useMemo(() => {
    if (!event) return null
    const organizerName = getEventOrganizerName(event)
    const sourceUrl = event.source_url?.trim() || eventUrl(event.slug)
    return {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: event.title,
      description: summary(event.description),
      startDate: event.starts_at || undefined,
      endDate: event.ends_at || undefined,
      eventAttendanceMode: 'https://schema.org/MixedEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      image: event.image_url ? [event.image_url] : undefined,
      url: eventUrl(event.slug),
      location: event.location
        ? {
            '@type': 'Place',
            name: event.location,
          }
        : undefined,
      organizer: {
        '@type': 'Organization',
        name: organizerName,
      },
      performer: {
        '@type': 'Organization',
        name: organizerName,
      },
      offers: {
        '@type': 'Offer',
        url: sourceUrl,
        price: '0',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        validFrom: getEventOfferValidFrom(event),
      },
    }
  }, [event])

  useEffect(() => {
    if (!eventJsonLd) return
    upsertJsonLd('event-detail', eventJsonLd)
  }, [eventJsonLd])

  const eventComments = useMemo(() => {
    const byRoot = new Map<string, NativeChatMessage[]>()
    const roots: NativeChatMessage[] = []
    for (const message of eventChatMessages) {
      if (message.thread_root_message_id) {
        const replies = byRoot.get(message.thread_root_message_id) || []
        replies.push(message)
        byRoot.set(message.thread_root_message_id, replies)
      } else {
        roots.push(message)
      }
    }
    roots.sort((a, b) => messageTime(a) - messageTime(b))
    for (const replies of byRoot.values()) replies.sort((a, b) => messageTime(a) - messageTime(b))
    return roots.map((message) => ({ message, replies: byRoot.get(message.id) || [] }))
  }, [eventChatMessages])

  const mediaItems = event?.media || []
  const selectedMedia = selectedMediaIndex >= 0 ? mediaItems[selectedMediaIndex] : null

  useEffect(() => {
    if (selectedMediaIndex >= mediaItems.length) setSelectedMediaIndex(-1)
  }, [mediaItems.length, selectedMediaIndex])

  useEffect(() => {
    if (!selectedMedia) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedMediaIndex(-1)
      if (event.key === 'ArrowLeft') setSelectedMediaIndex((current) => (current <= 0 ? mediaItems.length - 1 : current - 1))
      if (event.key === 'ArrowRight') setSelectedMediaIndex((current) => (current + 1) % mediaItems.length)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mediaItems.length, selectedMedia])

  async function postEventComment() {
    const body = commentDraft.trim()
    if (!eventChat?.conversation_id || !body || !eventChatReady) return
    try {
      setChatActionPending(true)
      setChatStatus('')
      const message = await chatApi.sendMessage(eventChat.conversation_id, uuid(), body)
      setCommentDraft('')
      setEventChatMessages((current) => [...current, message])
    } catch (err) {
      setChatStatus(toUserFacingErrorMessage(err, 'Could not post comment'))
    } finally {
      setChatActionPending(false)
    }
  }

  async function postEventReply(rootMessageId: string) {
    const body = (replyDrafts[rootMessageId] || '').trim()
    if (!eventChat?.conversation_id || !body || !eventChatReady) return
    try {
      setChatActionPending(true)
      setChatStatus('')
      const message = await chatApi.sendMessage(eventChat.conversation_id, uuid(), body, {
        replyToMessageId: rootMessageId,
        threadRootMessageId: rootMessageId,
      })
      setReplyDrafts((prev) => ({ ...prev, [rootMessageId]: '' }))
      setReplyingToId(null)
      setEventChatMessages((current) => [...current, message])
    } catch (err) {
      setChatStatus(toUserFacingErrorMessage(err, 'Could not post reply'))
    } finally {
      setChatActionPending(false)
    }
  }

  async function reactToEventComment(messageId: string, emoji: string) {
    if (!eventChat?.conversation_id || !eventChatReady) return
    try {
      setChatActionPending(true)
      setChatStatus('')
      const reactions = await chatApi.sendReaction(eventChat.conversation_id, messageId, emoji)
      setEventChatMessages((current) => current.map((message) => message.id === messageId ? { ...message, reactions } : message))
    } catch (err) {
      setChatStatus(toUserFacingErrorMessage(err, 'Could not add reaction'))
    } finally {
      setChatActionPending(false)
    }
  }

  async function saveToCalendar() {
    if (!event?.starts_at) return
    const calendarEvent = {
      external_event_id: `portal-event:${event.id}`,
      summary: event.title,
      description: event.description || 'Event saved from Org Portal.',
      starts_at: event.starts_at,
      ends_at: event.ends_at || event.starts_at,
      location: event.location || null,
      source_url: event.source_url || eventUrl(event.slug),
    }
    if (googleCalendarConnected) {
      const result = await savePortalEventToGoogleCalendar(token, calendarEvent)
      if (result.connected) return 'Saved to your registration and added to Google Calendar.'
    } else if (microsoftCalendarConnected) {
      const result = await savePortalEventToMicrosoftCalendar(token, calendarEvent)
      if (result.connected) return 'Saved to your registration and added to Microsoft Calendar.'
    }
  }

  async function copyEventAddress() {
    const address = event?.location?.trim()
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setAddressCopied(true)
      window.setTimeout(() => setAddressCopied(false), 1600)
    } catch {
      setAddressCopied(false)
    }
  }

  if (!event) {
    return (
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>Event</h1>
        <p className="muted">{status}</p>
      </section>
    )
  }

  const eventStart = event.starts_at
  const eventEnd = event.ends_at || eventStart || null
  const mapsUrl = event.location ? googleMapsUrl(event.location) : null
  const mapsEmbedUrl = event.location ? googleMapsEmbedUrl(event.location) : null
  const organizerName = getEventOrganizerName(event)
  const organizerAvatar = event.organization_image_url?.trim() || ''
  const publicEventUrl = event.source_url || eventUrl(event.slug)
  const calendarDownloadEvent = eventStart && eventEnd ? {
    title: event.title,
    description: event.description || 'Event from Org Portal.',
    location: event.location || null,
    startsAt: eventStart,
    endsAt: eventEnd,
    url: publicEventUrl,
  } : null

  return (
    <article className="public-event-page">
      <section className="public-event-hero">
        {event.image_url ? (
          <img className="public-event-hero-image" src={event.image_url} alt="" />
        ) : <div className="public-event-hero-image public-event-hero-placeholder" aria-hidden="true" />}
        <div className="public-event-hero-content">
          {event.organization_slug ? (
            <Link
              className="public-event-organizer-link"
              to={`/orgs/${encodeURIComponent(event.organization_slug)}`}
              aria-label={`View ${organizerName} group page`}
            >
              <span className="public-event-organizer-avatar" aria-hidden="true">
                {organizerAvatar ? <img src={organizerAvatar} alt="" /> : organizationInitials(organizerName)}
              </span>
              <span>{organizerName}</span>
            </Link>
          ) : (
            <p className="public-event-eyebrow">{organizerName}</p>
          )}
          <h1>{event.title}</h1>
          {canManageEvent ? (
            <Link className="btn-primary public-event-manage-button" to={`/orgs/events#event-${encodeURIComponent(event.slug)}`}>
              Manage Event
            </Link>
          ) : null}
        </div>
      </section>

      <div className="public-event-layout public-event-luma-layout">
        <main className="public-event-main">
          {mediaItems.length ? (
            <section className="portal-card public-event-media" aria-labelledby="event-media-title">
              <div className="public-event-card-heading">
                <p className="public-event-eyebrow">Event Media</p>
                <h2 id="event-media-title">Files And Images</h2>
              </div>
              <div className="public-event-media-grid">
                {mediaItems.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className="public-event-media-card"
                    onClick={() => setSelectedMediaIndex(index)}
                    aria-label={`Open ${item.alt || item.label} in gallery`}
                  >
                    <img
                      src={item.url}
                      alt={item.alt || item.label}
                    />
                    <strong>{item.label}</strong>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {event.description ? (
            <section className="portal-card public-event-description">
              <div className="public-event-card-heading">
                <p className="public-event-eyebrow">About The Event</p>
                <h2>What To Expect</h2>
              </div>
              <p>{event.description}</p>
            </section>
          ) : null}
      {event.source_url ? (
        <p style={{ margin: 0, overflowWrap: 'anywhere' }}>
          <a href={event.source_url} target="_blank" rel="noreferrer">
            Source / RSVP
          </a>
        </p>
      ) : null}
      <section className="portal-card public-event-chat">
        <div className="public-event-card-heading">
          <p className="public-event-eyebrow">Conversation</p>
          <h2>Comments</h2>
        </div>
        {chatLoading ? (
          <p className="muted" style={{ margin: 0 }}>Loading event chat…</p>
        ) : null}
        {chatStatus ? (
          <p className="muted" style={{ margin: 0 }}>{chatStatus}</p>
        ) : null}
        {eventChat?.room_exists ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              {eventChat.room_name || 'Event comments'}
            </p>
            {authLoading ? (
              <div className="public-event-comment-auth-loading" role="status" aria-label="Checking sign-in status">
                <span aria-hidden="true" />
              </div>
            ) : token ? (
              <div className="public-event-comment-composer">
                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder={eventChatReady ? 'Add a comment...' : 'Connecting before comments can be posted...'}
                  rows={3}
                  disabled={!eventChatReady || chatActionPending}
                />
                <div className="public-event-comment-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!eventChatReady || chatActionPending || !commentDraft.trim()}
                    onClick={() => postEventComment().catch(() => {})}
                  >
                    Post Comment
                  </button>
                  {eventChat.conversation_id ? (
                    <Link to={`/chat/${encodeURIComponent(eventChat.conversation_id)}`}>
                      Open full chat
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : (
              <a
                className="btn-primary"
                href={pidpAppLoginUrl(`/events/${encodeURIComponent(event.slug)}`)}
                style={{ textDecoration: 'none', width: 'fit-content' }}
              >
                Login to Comment
              </a>
            )}
            {eventComments.length ? (
              <div className="public-event-comment-list">
                {eventComments.map(({ message, replies }) => (
                  <article key={message.id} className="public-event-comment">
                    <CommentAvatar message={message} myUserId={myUserId} />
                    <div className="public-event-comment-body">
                      <div className="public-event-comment-meta">
                        <strong>{messageAuthorLabel(message, myUserId)}</strong>
                        <span>{toLocalDateTime(message.created_at)}</span>
                      </div>
                      <p>{message.body}</p>
                      <div className="public-event-comment-tools public-event-comment-tool-row">
                        <ReactionControls
                          message={message}
                          disabled={!eventChatReady || chatActionPending}
                          onReact={(messageId, emoji) => reactToEventComment(messageId, emoji).catch(() => {})}
                        />
                        {token ? (
                          <button type="button" onClick={() => setReplyingToId((current) => (current === message.id ? null : message.id))}>
                            Reply
                          </button>
                        ) : null}
                      </div>
                      {replies.length ? (
                        <div className="public-event-comment-replies">
                          {replies.map((reply) => (
                            <article key={reply.id} className="public-event-comment public-event-comment-reply">
                              <CommentAvatar message={reply} myUserId={myUserId} />
                              <div className="public-event-comment-body">
                                <div className="public-event-comment-meta">
                                  <strong>{messageAuthorLabel(reply, myUserId)}</strong>
                                  <span>{toLocalDateTime(reply.created_at)}</span>
                                </div>
                                <p>{reply.body}</p>
                                <ReactionControls
                                  message={reply}
                                  disabled={!eventChatReady || chatActionPending}
                                  onReact={(messageId, emoji) => reactToEventComment(messageId, emoji).catch(() => {})}
                                />
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : null}
                      {replyingToId === message.id ? (
                        <div className="public-event-comment-composer public-event-reply-composer">
                          <textarea
                            value={replyDrafts[message.id] || ''}
                            onChange={(event) => setReplyDrafts((prev) => ({ ...prev, [message.id]: event.target.value }))}
                            placeholder="Write a reply..."
                            rows={2}
                            disabled={!eventChatReady || chatActionPending}
                          />
                          <div className="public-event-comment-actions">
                            <button
                              type="button"
                              className="btn-primary"
                              disabled={!eventChatReady || chatActionPending || !(replyDrafts[message.id] || '').trim()}
                              onClick={() => postEventReply(message.id).catch(() => {})}
                            >
                              Post Reply
                            </button>
                            <button type="button" onClick={() => setReplyingToId(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>No comments yet.</p>
            )}
          </>
        ) : !chatLoading && !chatStatus ? (
          <p className="muted" style={{ margin: 0 }}>Comments are not available for this event yet.</p>
        ) : null}
      </section>
        </main>
        <aside className="public-event-side public-event-luma-side" aria-label="Event actions and location">
          <EventRegistration key={`${event.id}:${user?.id || 'guest'}:${Boolean(token)}`}
            eventId={event.id} slug={event.slug} token={token} authLoading={authLoading} saveToCalendar={saveToCalendar}
            organizationName={event.host_org_id ? event.organization_name || event.host_org_name : null} />
          <section className="portal-card public-event-logistics-card" aria-label="Event details">
            <div className="public-event-logistics-list">
              <div className="public-event-logistics-item">
                <span>Date</span>
                <strong>{toEventDate(event.starts_at)}</strong>
              </div>
              <div className="public-event-logistics-item">
                <span>Time</span>
                <strong>{toEventTimeRange(event.starts_at, event.ends_at)}</strong>
                {calendarDownloadEvent ? (
                  <div className="public-event-calendar-actions" aria-label="Add event to calendar">
                    <button
                      type="button"
                      className="public-event-icon-action"
                      onClick={() => downloadIcsEvent(calendarDownloadEvent)}
                      title="Download calendar file"
                      aria-label="Download calendar file"
                    >
                      <Download size={17} aria-hidden="true" />
                    </button>
                    <a
                      className="public-event-icon-action"
                      href={outlookCalendarUrl(calendarDownloadEvent)}
                      target="_blank"
                      rel="noreferrer"
                      title="Add to Outlook calendar"
                      aria-label="Add to Outlook calendar"
                    >
                      <CalendarPlus size={17} aria-hidden="true" />
                    </a>
                  </div>
                ) : null}
              </div>
              {event.location ? (
                <div className="public-event-logistics-item">
                  <span>Location</span>
                  <div className="public-event-location-row">
                    <strong>{event.location}</strong>
                    <div className="public-event-location-actions" aria-label="Location actions">
                      <button
                        type="button"
                        className="public-event-icon-action"
                        onClick={() => copyEventAddress().catch(() => {})}
                        title={addressCopied ? 'Address copied' : 'Copy address'}
                        aria-label={addressCopied ? 'Address copied' : 'Copy address'}
                      >
                        <Copy size={17} aria-hidden="true" />
                      </button>
                      {mapsUrl ? (
                        <a
                          className="public-event-icon-action"
                          href={mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Open in Google Maps"
                          aria-label="Open location in Google Maps"
                        >
                          <MapPinned size={17} aria-hidden="true" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            {event.location && mapsUrl && mapsEmbedUrl ? (
              <div className="public-event-map-card">
                <a className="public-event-map-frame" href={mapsUrl} target="_blank" rel="noreferrer" aria-label={`Open ${event.location} in Google Maps`}>
                  <iframe title={`Map for ${event.location}`} src={mapsEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                </a>
              </div>
            ) : null}
          </section>
          <EventPosterTools slug={event.slug} title={event.title} revision={event.updated_at || ''} inline />
        </aside>
      </div>
      {selectedMedia ? (
        <div className="public-event-gallery-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedMediaIndex(-1)
        }}>
          <section
            className="public-event-gallery-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-gallery-title"
          >
            <div className="public-event-gallery-toolbar">
              <div>
                <p className="public-event-eyebrow">Event Gallery</p>
                <h2 id="event-gallery-title">{selectedMedia.label}</h2>
              </div>
              <div className="public-event-gallery-actions">
                <a href={selectedMedia.url} target="_blank" rel="noopener noreferrer" title="Open image file">
                  <ExternalLink size={18} aria-hidden="true" />
                  <span>Open</span>
                </a>
                <button type="button" onClick={() => setSelectedMediaIndex(-1)} aria-label="Close gallery" title="Close gallery">
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="public-event-gallery-stage">
              {mediaItems.length > 1 ? (
                <button
                  type="button"
                  className="public-event-gallery-nav public-event-gallery-prev"
                  onClick={() => setSelectedMediaIndex((current) => (current <= 0 ? mediaItems.length - 1 : current - 1))}
                  aria-label="Previous image"
                  title="Previous image"
                >
                  <ChevronLeft size={26} aria-hidden="true" />
                </button>
              ) : null}
              <img src={selectedMedia.url} alt={selectedMedia.alt || selectedMedia.label} />
              {mediaItems.length > 1 ? (
                <button
                  type="button"
                  className="public-event-gallery-nav public-event-gallery-next"
                  onClick={() => setSelectedMediaIndex((current) => (current + 1) % mediaItems.length)}
                  aria-label="Next image"
                  title="Next image"
                >
                  <ChevronRight size={26} aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <p className="public-event-gallery-count">{selectedMediaIndex + 1} of {mediaItems.length}</p>
          </section>
        </div>
      ) : null}
    </article>
  )
}
