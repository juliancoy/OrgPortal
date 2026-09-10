import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ClientEvent, EventType, RoomEvent } from 'matrix-js-sdk'
import { setSeoMeta, upsertJsonLd } from '../../utils/seo'
import type { ChatMessage } from '../../../application/ports/ChatService'
import { useAuth, useServices } from '../../../app/AppProviders'
import { bootstrapMatrixSessionFromOrg } from '../../../chat/bootstrapSession'
import { PIDP_BASE_URL, pidpAppLoginUrl, pidpUrl } from '../../../config/pidp'
import { OrgImage } from '../../components/media/OrgImage'
import { ImageEditorModal } from '../../components/media/ImageEditorModal'
import { resolveSignedS3UploadUrl } from '../../../infrastructure/auth/avatarUpload'
import { toUserFacingErrorMessage } from '../../../infrastructure/http/userFacingError'
import {
  readCachedOrgChatFeed,
  readCachedRoomMessages,
  writeCachedOrgChatFeed,
  writeCachedRoomMessages,
} from '../../../infrastructure/utils/chatWindowCache'

const ORG_API_BASE = '/api/org'
const ORG_PLACEHOLDER_SRC = '/images/org-placeholder.svg'
const QUICK_REACTIONS = ['👍', '❤️', '🔥', '🎉']

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

type PublicOrganization = {
  id: string
  name: string
  slug: string
  description?: string | null
  source_url?: string | null
  image_url?: string | null
  tags?: string[]
  upcoming_events_count: number
  membership_count?: number
  feedback_count?: number
  feedback_positive_count?: number
  feedback_concern_count?: number
  feedback_score?: number
  claimed_by_user_id?: string | null
  pending_challenges_count: number
  is_disputed: boolean
  redirected_from_slug?: string | null
}

type FeedbackRating = 'positive' | 'neutral' | 'concern'

type OrganizationFeedback = {
  organization_id: string
  my_feedback: {
    rating: FeedbackRating
    comment: string
    updated_at: string
  } | null
  feedback_count: number
  feedback_positive_count: number
  feedback_concern_count: number
  feedback_score: number
}

type OrganizationFeedbackReview = {
  organization_id: string
  user_id: string
  user_name?: string | null
  rating: FeedbackRating
  comment: string
  created_at: string
  updated_at: string
}

type OrganizationMembership = {
  organization_id: string
  role: string | null
  status: 'active' | 'none'
  membership_count: number
}

type OrganizationPortal = {
  id: string
  organization_id?: string | null
  slug?: string | null
  slug_url?: string | null
  name: string
  tagline: string
  accent_color: string
  features?: string[]
  home_kind?: 'default' | 'landing' | 'route' | 'org' | 'org-events' | 'timebank' | 'auth' | null
  home_heading?: string | null
  home_description?: string | null
  home_image_url?: string | null
  custom_domain_hostname?: string | null
  custom_domain_status?: 'none' | 'requested' | 'attached' | 'blocked' | null
  custom_domain_requested_at?: string | null
  custom_domain_attached_at?: string | null
  custom_domain_notes?: string | null
}

type PublicEvent = {
  id: string
  title: string
  slug: string
  description?: string | null
  starts_at?: string | null
  location?: string | null
  image_url?: string | null
}

type PublicOrgAdmin = {
  user_id: string
  user_name?: string | null
  role: string
}

type PublicOrgChatMessage = {
  event_id: string
  sender?: string | null
  body: string
  sent_at?: string | null
}

type PublicOrgChatRoomFeed = {
  key: 'public_chat' | 'general' | 'announcements' | string
  label: string
  room_id?: string | null
  room_alias?: string | null
  room_name?: string | null
  messages: PublicOrgChatMessage[]
}

type PublicOrgChatFeed = {
  organization_slug: string
  rooms: PublicOrgChatRoomFeed[]
}

type MatrixEventedClient = {
  on: (event: string, listener: (...args: unknown[]) => void) => void
  off: (event: string, listener: (...args: unknown[]) => void) => void
}

type MyOrganization = {
  id: string
  name: string
  slug: string
  my_role?: string | null
}

function currentOrgUrl(slug: string) {
  return `${window.location.origin}/orgs/${encodeURIComponent(slug)}`
}

function summarize(text?: string | null) {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return 'Public profile for organization in the Org network.'
  return clean.length > 280 ? `${clean.slice(0, 277)}...` : clean
}

function formatDate(value?: string | null) {
  if (!value) return 'TBD'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return 'TBD'
  return dt.toLocaleString()
}

function normalizePortalSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
}

function messageAuthorLabel(message: ChatMessage, myUserId: string | null): string {
  if (myUserId && message.sender === myUserId) return 'You'
  if (message.senderDisplayName?.trim()) return message.senderDisplayName.trim()
  const sender = String(message.sender || 'unknown')
  const parts = sender.split(':')[0].split('@')
  return parts[1] || sender
}

function messageAuthorInitial(message: ChatMessage, myUserId: string | null): string {
  const label = messageAuthorLabel(message, myUserId).trim()
  return (label[0] || '?').toUpperCase()
}

export function PublicAdminPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const { chatService } = useServices()
  const { handle } = useParams()
  const [searchParams] = useSearchParams()
  const [org, setOrg] = useState<PublicOrganization | null>(null)
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [admins, setAdmins] = useState<PublicOrgAdmin[]>([])
  const [adminsLoading, setAdminsLoading] = useState(false)
  const [publicChatFeed, setPublicChatFeed] = useState<PublicOrgChatFeed | null>(null)
  const [chatFeedLoading, setChatFeedLoading] = useState(false)
  const [status, setStatus] = useState<string>('Loading organization…')
  const [claimStatus, setClaimStatus] = useState<string | null>(null)
  const [feedbackRating, setFeedbackRating] = useState<FeedbackRating>('neutral')
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null)
  const [feedbackReviews, setFeedbackReviews] = useState<OrganizationFeedbackReview[]>([])
  const [feedbackReviewStatus, setFeedbackReviewStatus] = useState<string | null>(null)
  const [membership, setMembership] = useState<OrganizationMembership | null>(null)
  const [membershipStatus, setMembershipStatus] = useState<string | null>(null)
  const [portalConfig, setPortalConfig] = useState<OrganizationPortal | null>(null)
  const [portalSlugDraft, setPortalSlugDraft] = useState('')
  const [portalNameDraft, setPortalNameDraft] = useState('')
  const [portalTaglineDraft, setPortalTaglineDraft] = useState('')
  const [portalHomeKindDraft, setPortalHomeKindDraft] = useState<OrganizationPortal['home_kind']>('landing')
  const [portalHeadingDraft, setPortalHeadingDraft] = useState('')
  const [portalDescriptionDraft, setPortalDescriptionDraft] = useState('')
  const [portalImageDraft, setPortalImageDraft] = useState('')
  const [portalDomainDraft, setPortalDomainDraft] = useState('')
  const [portalDomainNotesDraft, setPortalDomainNotesDraft] = useState('')
  const [portalDomainChecklist, setPortalDomainChecklist] = useState<string[]>([])
  const [portalStatus, setPortalStatus] = useState<string | null>(null)
  const [savingPortal, setSavingPortal] = useState(false)
  const [savingPortalDomain, setSavingPortalDomain] = useState(false)
  const [claimRequestMessage, setClaimRequestMessage] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [myAdminOrgs, setMyAdminOrgs] = useState<MyOrganization[]>([])
  const [myAdminOrgsStatus, setMyAdminOrgsStatus] = useState<string | null>(null)
  const [mergeSourceOrgId, setMergeSourceOrgId] = useState('')
  const [mergeStatus, setMergeStatus] = useState<string | null>(null)
  const [merging, setMerging] = useState(false)
  const [orgNameDraft, setOrgNameDraft] = useState('')
  const [orgImageDraft, setOrgImageDraft] = useState('')
  const [savingOrgName, setSavingOrgName] = useState(false)
  const [savingOrgImage, setSavingOrgImage] = useState(false)
  const [adminView, setAdminView] = useState(true)
  const [showImageEditor, setShowImageEditor] = useState(false)
  const [editorSource, setEditorSource] = useState<string | null>(null)
  const [generalLiveMessages, setGeneralLiveMessages] = useState<ChatMessage[]>([])
  const [generalChatStatus, setGeneralChatStatus] = useState<string | null>(null)
  const [generalDraft, setGeneralDraft] = useState('')
  const [sendingGeneral, setSendingGeneral] = useState(false)
  const [canPostGeneral, setCanPostGeneral] = useState(false)
  const [generalSessionReady, setGeneralSessionReady] = useState(false)
  const [generalLiveEnabled, setGeneralLiveEnabled] = useState(false)
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [openGeneralMenuMessageId, setOpenGeneralMenuMessageId] = useState<string | null>(null)
  const [editingGeneralMessageId, setEditingGeneralMessageId] = useState<string | null>(null)
  const [generalEditDraft, setGeneralEditDraft] = useState('')
  const [generalActionPending, setGeneralActionPending] = useState(false)
  const hasExistingAdmins = admins.some((admin) => admin.role === 'administrator' || admin.role === 'owner')
  const canManageCurrentOrg = myAdminOrgs.some((item) => item.id === org?.id)
  const claimActionLabel = hasExistingAdmins ? 'Challenge Ownership' : 'Claim This Organization'
  const generalRoom = useMemo(
    () => (publicChatFeed?.rooms || []).find((room) => room.key === 'public_chat' || room.key === 'general') || null,
    [publicChatFeed],
  )
  const announcementsRoom = useMemo(
    () => (publicChatFeed?.rooms || []).find((room) => room.key === 'announcements') || null,
    [publicChatFeed],
  )
  const fallbackGeneralMessages = useMemo<ChatMessage[]>(
    () =>
      (generalRoom?.messages || []).map((message) => ({
        id: message.event_id,
        sender: message.sender || 'unknown',
        body: message.body,
        ts: message.sent_at ? new Date(message.sent_at).getTime() : Date.now(),
      })),
    [generalRoom],
  )
  const renderedGeneralMessages = generalLiveMessages.length > 0 ? generalLiveMessages : fallbackGeneralMessages

  useEffect(() => {
    if (!handle) return
    const canonicalUrl = currentOrgUrl(handle)
    setSeoMeta({
      title: `Organization • ${handle} • Org Portal`,
      description: 'Public organization profile in the Org network.',
      canonicalUrl,
      type: 'website',
    })
  }, [handle])

  useEffect(() => {
    if (!handle) return
    setStatus('Loading organization…')
    fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(handle)}`))
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Organization not found (${resp.status})`)
        }
        return resp.json() as Promise<PublicOrganization>
      })
      .then((orgData) => {
        if (orgData.redirected_from_slug && orgData.slug !== handle) {
          navigate(
            `/orgs/${encodeURIComponent(orgData.slug)}?merged_from=${encodeURIComponent(orgData.redirected_from_slug)}`,
            { replace: true },
          )
          return
        }
        setOrg(orgData)
        setOrgNameDraft(orgData.name || '')
        setOrgImageDraft(orgData.image_url || '')
        setPortalSlugDraft(normalizePortalSlug(orgData.slug || orgData.name || ''))
        setPortalNameDraft(orgData.name || '')
        setPortalTaglineDraft(orgData.description || '')
        setPortalHomeKindDraft('landing')
        setPortalHeadingDraft(orgData.name || '')
        setPortalDescriptionDraft(orgData.description || '')
        setPortalImageDraft(orgData.image_url || '')
        setEvents([])
        setAdmins([])
        setPublicChatFeed(null)
        setStatus('')
      })
      .catch((err) => {
        setOrg(null)
        setEvents([])
        setAdmins([])
        setPublicChatFeed(null)
        setStatus(toUserFacingErrorMessage(err, 'Organization unavailable'))
      })
  }, [handle, navigate])

  useEffect(() => {
    if (!org?.slug) return
    let cancelled = false
    const cachedFeed = readCachedOrgChatFeed<PublicOrgChatFeed>(org.slug)
    if (cachedFeed?.rooms?.length) {
      setPublicChatFeed(cachedFeed)
    }
    setEventsLoading(true)
    setAdminsLoading(true)
    setChatFeedLoading(true)
    Promise.all([
      fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(org.slug)}/events?upcoming_only=false&limit=60`)).then(
        async (resp) => {
          if (!resp.ok) return []
          return (await resp.json()) as PublicEvent[]
        },
      ),
      fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(org.slug)}/admins`)).then(async (resp) => {
        if (!resp.ok) return []
        return (await resp.json()) as PublicOrgAdmin[]
      }),
      fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(org.slug)}/chat-feed`)).then(async (resp) => {
        if (!resp.ok) return null
        return (await resp.json()) as PublicOrgChatFeed
      }),
    ])
      .then(([eventData, adminData, chatFeedData]) => {
        if (cancelled) return
        setEvents(Array.isArray(eventData) ? eventData : [])
        setAdmins(Array.isArray(adminData) ? adminData : [])
        setPublicChatFeed(chatFeedData)
        if (chatFeedData?.rooms?.length) {
          writeCachedOrgChatFeed(org.slug, chatFeedData)
        }
      })
      .finally(() => {
        if (cancelled) return
        setEventsLoading(false)
        setAdminsLoading(false)
        setChatFeedLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [org?.slug])

  useEffect(() => {
    if (!org?.id || !token) {
      setFeedbackRating('neutral')
      setFeedbackComment('')
      setMembership(null)
      return
    }
    let cancelled = false
    Promise.all([
      fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/feedback`), {
        headers: { Authorization: `Bearer ${token}` },
      }).then(async (resp) => (resp.ok ? ((await resp.json()) as OrganizationFeedback) : null)),
      fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/membership`), {
        headers: { Authorization: `Bearer ${token}` },
      }).then(async (resp) => (resp.ok ? ((await resp.json()) as OrganizationMembership) : null)),
    ])
      .then(([feedback, membershipData]) => {
        if (cancelled) return
        if (feedback) {
          setFeedbackRating(feedback.my_feedback?.rating || 'neutral')
          setFeedbackComment(feedback.my_feedback?.comment || '')
          setOrg((prev) =>
            prev
              ? {
                  ...prev,
                  feedback_count: feedback.feedback_count,
                  feedback_positive_count: feedback.feedback_positive_count,
                  feedback_concern_count: feedback.feedback_concern_count,
                  feedback_score: feedback.feedback_score,
                }
              : prev,
          )
        }
        if (membershipData) {
          setMembership(membershipData)
          setOrg((prev) => (prev ? { ...prev, membership_count: membershipData.membership_count } : prev))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFeedbackRating('neutral')
          setFeedbackComment('')
          setMembership(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [org?.id, token])

  const mergedFrom = (searchParams.get('merged_from') || '').trim()

  useEffect(() => {
    if (!org) return
    setSeoMeta({
      title: `${org.name} • Org Portal`,
      description: summarize(org.description),
      canonicalUrl: currentOrgUrl(org.slug),
      imageUrl: org.image_url || undefined,
      type: 'website',
    })
  }, [org])

  useEffect(() => {
    if (!token) {
      setMyAdminOrgs([])
      setMyAdminOrgsStatus('Sign in to access organization admin controls.')
      return
    }
    setMyAdminOrgsStatus('Loading admin organizations…')
    fetch(orgUrl('/api/network/orgs?mine=true&limit=300'), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Failed to load organizations (${resp.status})`)
        }
        return (await resp.json()) as MyOrganization[]
      })
      .then((rows) => {
        const admins = (Array.isArray(rows) ? rows : []).filter((row) => row.my_role === 'owner' || row.my_role === 'administrator')
        setMyAdminOrgs(admins)
        setMyAdminOrgsStatus('')
      })
      .catch((err) => {
        setMyAdminOrgs([])
        setMyAdminOrgsStatus(toUserFacingErrorMessage(err, 'Failed to load admin organizations'))
      })
  }, [token])

  useEffect(() => {
    if (!org?.id || !token || !canManageCurrentOrg) {
      setFeedbackReviews([])
      setFeedbackReviewStatus(null)
      return
    }
    let cancelled = false
    setFeedbackReviewStatus('Loading feedback...')
    fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/feedback/review?limit=100`), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Failed to load feedback (${resp.status})`)
        }
        return (await resp.json()) as OrganizationFeedbackReview[]
      })
      .then((rows) => {
        if (cancelled) return
        setFeedbackReviews(Array.isArray(rows) ? rows : [])
        setFeedbackReviewStatus('')
      })
      .catch((err) => {
        if (cancelled) return
        setFeedbackReviews([])
        setFeedbackReviewStatus(toUserFacingErrorMessage(err, 'Failed to load feedback'))
      })
    return () => {
      cancelled = true
    }
  }, [canManageCurrentOrg, org?.id, token])

  useEffect(() => {
    if (!org?.id || !token || !canManageCurrentOrg) {
      setPortalConfig(null)
      setPortalStatus(null)
      return
    }
    let cancelled = false
    setPortalStatus('Loading portal setup...')
    fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/portal`), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Failed to load portal (${resp.status})`)
        }
        return (await resp.json()) as { portal: OrganizationPortal | null }
      })
      .then(({ portal }) => {
        if (cancelled) return
        setPortalConfig(portal)
        if (portal) {
          setPortalSlugDraft(normalizePortalSlug(portal.slug || org.slug))
          setPortalNameDraft(portal.name || org.name)
          setPortalTaglineDraft(portal.tagline || org.description || '')
          setPortalHomeKindDraft(portal.home_kind || 'landing')
          setPortalHeadingDraft(portal.home_heading || portal.name || org.name)
          setPortalDescriptionDraft(portal.home_description || portal.tagline || org.description || '')
          setPortalImageDraft(portal.home_image_url || org.image_url || '')
          setPortalDomainDraft(portal.custom_domain_hostname || '')
          setPortalDomainNotesDraft(portal.custom_domain_notes || '')
        }
        setPortalStatus('')
      })
      .catch((err) => {
        if (cancelled) return
        setPortalStatus(toUserFacingErrorMessage(err, 'Failed to load portal setup'))
      })
    return () => {
      cancelled = true
    }
  }, [canManageCurrentOrg, org?.id, org?.image_url, org?.name, org?.slug, org?.description, token])

  useEffect(() => {
    if (!org?.slug) return
    let cancelled = false
    const cachedFeed = readCachedOrgChatFeed<PublicOrgChatFeed>(org.slug)
    if (cachedFeed?.rooms?.length) {
      setPublicChatFeed((prev) => (prev?.rooms?.length ? prev : cachedFeed))
    }
    const refresh = () => {
      fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(org.slug)}/chat-feed`))
        .then(async (resp) => {
          if (!resp.ok) return null
          return (await resp.json()) as PublicOrgChatFeed
        })
        .then((payload) => {
          if (cancelled || !payload) return
          setPublicChatFeed(payload)
          if (payload.rooms?.length) {
            writeCachedOrgChatFeed(org.slug, payload)
          }
        })
        .catch(() => {})
    }
    refresh()
    const timer = window.setInterval(refresh, 15000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [org?.slug])

  useEffect(() => {
    const roomId = generalRoom?.room_id || ''
    setCanPostGeneral(Boolean(token && roomId))
    if (!token) setMyUserId(null)
    setOpenGeneralMenuMessageId(null)
    setEditingGeneralMessageId(null)
    setGeneralEditDraft('')
  }, [token, generalRoom?.room_id])

  useEffect(() => {
    // Public Chat is writable by all signed-in users.
    if (token && generalRoom?.room_id) setGeneralLiveEnabled(true)
  }, [token, generalRoom?.room_id])

  useEffect(() => {
    const activeToken = (token || '').trim()
    const roomId = generalRoom?.room_id || ''
    let cancelled = false
    setGeneralSessionReady(false)
    if (roomId) {
      const cachedMessages = readCachedRoomMessages(roomId)
      setGeneralLiveMessages(cachedMessages)
    } else {
      setGeneralLiveMessages([])
    }
    if (!generalLiveEnabled || !activeToken || !roomId) return

    async function initGeneralLiveChat() {
      try {
        setGeneralChatStatus('Connecting to live chat…')
        const session = await bootstrapMatrixSessionFromOrg(activeToken)
        const client = await chatService.start(session)
        await chatService.verifySession()
        await chatService.joinRoom(roomId)
        if (cancelled) return
        setMyUserId(client.getUserId())
        setGeneralSessionReady(true)
        setGeneralChatStatus(null)
        const initialMessages = chatService.listMessages(roomId)
        setGeneralLiveMessages(initialMessages)
        writeCachedRoomMessages(roomId, initialMessages)

        const refreshMessages = () => {
          if (cancelled) return
          const nextMessages = chatService.listMessages(roomId)
          setGeneralLiveMessages(nextMessages)
          writeCachedRoomMessages(roomId, nextMessages)
        }
        const onTimeline = (event: unknown, room: { roomId: string } | undefined, toStartOfTimeline?: boolean) => {
          if (toStartOfTimeline) return
          const matrixEvent = event as { getType?: () => string }
          if (matrixEvent.getType?.() !== EventType.RoomMessage) return
          if (!room || room.roomId !== roomId) return
          refreshMessages()
        }
        const onSync = () => {
          refreshMessages()
        }
        const eventedClient = client as unknown as MatrixEventedClient
        const timelineListener = onTimeline as (...args: unknown[]) => void
        eventedClient.on(RoomEvent.Timeline, timelineListener)
        eventedClient.on(ClientEvent.Sync, onSync)

        return () => {
          eventedClient.off(RoomEvent.Timeline, timelineListener)
          eventedClient.off(ClientEvent.Sync, onSync)
        }
      } catch (err) {
        if (cancelled) return
        setGeneralSessionReady(false)
        setGeneralChatStatus(toUserFacingErrorMessage(err, 'Live chat unavailable'))
      }
      return undefined
    }

    let cleanupListeners: (() => void) | undefined
    initGeneralLiveChat()
      .then((cleanup) => {
        cleanupListeners = cleanup
      })
      .catch(() => {})

    return () => {
      cancelled = true
      if (cleanupListeners) cleanupListeners()
      chatService.stop()
    }
  }, [generalLiveEnabled, token, generalRoom?.room_id, chatService])

  const jsonLd = useMemo(() => {
    if (!org) return null
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: org.name,
        description: summarize(org.description),
        url: currentOrgUrl(org.slug),
        logo: org.image_url || undefined,
        sameAs: org.source_url ? [org.source_url] : undefined,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: org.name,
        url: currentOrgUrl(org.slug),
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Organizations',
              item: `${window.location.origin}/orgs`,
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: org.name,
              item: currentOrgUrl(org.slug),
            },
          ],
        },
      },
    ]
  }, [org])

  useEffect(() => {
    if (!jsonLd) return
    upsertJsonLd('org-profile', jsonLd)
  }, [jsonLd])

  useEffect(() => {
    if (!openGeneralMenuMessageId) return
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.portal-chat-card-menu')) return
      setOpenGeneralMenuMessageId(null)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [openGeneralMenuMessageId])

  async function claimOrganizationBySlug() {
    if (!handle || !token || !org) {
      setClaimStatus('Sign in to claim this organization.')
      return
    }
    if (canManageCurrentOrg) {
      setClaimStatus('You already manage this organization.')
      return
    }
    setClaiming(true)
    setClaimStatus(null)
    try {
      if (hasExistingAdmins) {
        const explanation = claimRequestMessage.trim()
        if (!explanation) {
          setClaimStatus('Explain why ownership should change.')
          return
        }
        const requestResp = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/ownership-challenges`), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            explanation,
          }),
        })
        if (requestResp.ok) {
          setClaimStatus('Ownership challenge filed. The organization is now marked disputed.')
          const freshOrgResp = await fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(handle)}`))
          if (freshOrgResp.ok) setOrg((await freshOrgResp.json()) as PublicOrganization)
          return
        }
        const requestText = await requestResp.text().catch(() => '')
        throw new Error(requestText || `Ownership challenge failed (${requestResp.status})`)
      }
      const resp = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/claim`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.status === 409) {
        setClaimStatus('This organization was just claimed. Refresh to file an ownership challenge.')
        return
      }
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Claim failed (${resp.status})`)
      }
      setClaimStatus('Organization claimed. You are now its owner.')
      const [freshOrgResp, freshAdminsResp] = await Promise.all([
        fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(handle)}`)),
        fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(handle)}/admins`)),
      ])
      if (freshOrgResp.ok) {
        setOrg((await freshOrgResp.json()) as PublicOrganization)
      }
      if (freshAdminsResp.ok) {
        setAdmins((await freshAdminsResp.json()) as PublicOrgAdmin[])
      }
    } catch (err) {
      setClaimStatus(toUserFacingErrorMessage(err, 'Claim failed'))
    } finally {
      setClaiming(false)
    }
  }

  function applyFeedbackPayload(payload: OrganizationFeedback) {
    setFeedbackRating(payload.my_feedback?.rating || 'neutral')
    setFeedbackComment(payload.my_feedback?.comment || '')
    setOrg((prev) =>
      prev
        ? {
            ...prev,
            feedback_count: payload.feedback_count,
            feedback_positive_count: payload.feedback_positive_count,
            feedback_concern_count: payload.feedback_concern_count,
            feedback_score: payload.feedback_score,
          }
        : prev,
    )
  }

  async function saveOrganizationFeedback() {
    if (!org) return
    if (!token) {
      window.location.assign(pidpAppLoginUrl(`/orgs/${encodeURIComponent(org.slug)}`))
      return
    }
    setFeedbackStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/feedback`), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rating: feedbackRating, comment: feedbackComment }),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Feedback update failed (${resp.status})`)
      }
      applyFeedbackPayload((await resp.json()) as OrganizationFeedback)
      setFeedbackStatus('Feedback saved.')
    } catch (err) {
      setFeedbackStatus(toUserFacingErrorMessage(err, 'Could not update organization feedback'))
    }
  }

  async function clearOrganizationFeedback() {
    if (!org || !token) return
    setFeedbackStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/feedback`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Feedback update failed (${resp.status})`)
      }
      applyFeedbackPayload((await resp.json()) as OrganizationFeedback)
      setFeedbackStatus('Feedback cleared.')
    } catch (err) {
      setFeedbackStatus(toUserFacingErrorMessage(err, 'Could not clear organization feedback'))
    }
  }

  async function updateOrganizationMembership(join: boolean) {
    if (!org) return
    if (!token) {
      window.location.assign(pidpAppLoginUrl(`/orgs/${encodeURIComponent(org.slug)}`))
      return
    }
    setMembershipStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/membership`), {
        method: join ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Membership update failed (${resp.status})`)
      }
      const payload = (await resp.json()) as OrganizationMembership
      setMembership(payload)
      setOrg((prev) => (prev ? { ...prev, membership_count: payload.membership_count } : prev))
      setMembershipStatus(join ? 'You joined this group.' : 'You left this group.')
    } catch (err) {
      setMembershipStatus(toUserFacingErrorMessage(err, 'Could not update group membership'))
    }
  }

  async function saveOrganizationPortal() {
    if (!org || !token) return
    const slug = normalizePortalSlug(portalSlugDraft || org.slug)
    if (!slug || slug.length < 3) {
      setPortalStatus('Use a portal slug with at least 3 characters.')
      return
    }
    setSavingPortal(true)
    setPortalStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/portal`), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slug,
          name: portalNameDraft || org.name,
          tagline: portalTaglineDraft || org.description || `Portal for ${org.name}`,
          home_kind: portalHomeKindDraft || 'landing',
          home_heading: portalHeadingDraft || portalNameDraft || org.name,
          home_description: portalDescriptionDraft || portalTaglineDraft || org.description || '',
          home_image_url: portalImageDraft || org.image_url || null,
          features: ['directory', 'events', 'chat'],
        }),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Portal update failed (${resp.status})`)
      }
      const payload = (await resp.json()) as { portal: OrganizationPortal }
      setPortalConfig(payload.portal)
      setPortalSlugDraft(normalizePortalSlug(payload.portal.slug || slug))
      setPortalStatus('Portal saved.')
    } catch (err) {
      setPortalStatus(toUserFacingErrorMessage(err, 'Could not save portal setup'))
    } finally {
      setSavingPortal(false)
    }
  }

  async function updatePortalCustomDomain(action: 'request' | 'attach') {
    if (!org || !token) return
    const hostname = normalizeDomain(portalDomainDraft)
    if (!hostname) {
      setPortalStatus('Enter the custom domain first.')
      return
    }
    setSavingPortalDomain(true)
    setPortalStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/portal/custom-domain/${action}`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hostname, notes: portalDomainNotesDraft || null }),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Custom domain update failed (${resp.status})`)
      }
      const payload = (await resp.json()) as { portal: OrganizationPortal; checklist?: string[] }
      setPortalConfig(payload.portal)
      setPortalDomainDraft(payload.portal.custom_domain_hostname || hostname)
      setPortalDomainChecklist(Array.isArray(payload.checklist) ? payload.checklist : [])
      setPortalStatus(action === 'request' ? 'Custom domain request saved.' : 'Custom domain attached.')
    } catch (err) {
      setPortalStatus(toUserFacingErrorMessage(err, 'Could not update custom domain'))
    } finally {
      setSavingPortalDomain(false)
    }
  }

  async function mergeOrgIntoCurrent() {
    if (!org || !token) {
      setMergeStatus('Sign in to merge organizations.')
      return
    }
    if (!mergeSourceOrgId) {
      setMergeStatus('Select a source organization to merge.')
      return
    }
    setMerging(true)
    setMergeStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/merge`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ source_organization_id: mergeSourceOrgId }),
      })
      if (!resp.ok) {
        let detail = ''
        try {
          const payload = (await resp.json()) as { detail?: string }
          detail = String(payload?.detail || '').trim()
        } catch {
          detail = (await resp.text().catch(() => '')).trim()
        }
        throw new Error(detail || `Merge failed (${resp.status})`)
      }
      setMergeStatus('Organization merged successfully.')
      setMyAdminOrgs((prev) => prev.filter((item) => item.id !== mergeSourceOrgId))
      setMergeSourceOrgId('')
    } catch (err) {
      setMergeStatus(toUserFacingErrorMessage(err, 'Merge failed'))
    } finally {
      setMerging(false)
    }
  }

  async function saveOrganizationName() {
    if (!org || !token) {
      setMergeStatus('Sign in to update this organization.')
      return
    }
    const nextName = orgNameDraft.trim()
    if (!nextName) {
      setMergeStatus('Organization name is required.')
      return
    }
    setSavingOrgName(true)
    setMergeStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}`), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: nextName }),
      })
      if (!resp.ok) {
        let detail = ''
        try {
          const payload = (await resp.json()) as { detail?: string }
          detail = String(payload?.detail || '').trim()
        } catch {
          detail = (await resp.text().catch(() => '')).trim()
        }
        throw new Error(detail || `Update failed (${resp.status})`)
      }
      const updated = (await resp.json()) as { name?: string }
      const updatedName = String(updated?.name || nextName)
      setOrg((prev) => (prev ? { ...prev, name: updatedName } : prev))
      setMyAdminOrgs((prev) =>
        prev.map((row) => (row.id === org.id ? { ...row, name: updatedName } : row)),
      )
      setOrgNameDraft(updatedName)
      setMergeStatus('Organization name updated.')
    } catch (err) {
      setMergeStatus(toUserFacingErrorMessage(err, 'Update failed'))
    } finally {
      setSavingOrgName(false)
    }
  }

  async function saveOrganizationImage(nextImageOverride?: string | null) {
    if (!org || !token) {
      setMergeStatus('Sign in to update this organization.')
      return
    }
    const candidate = typeof nextImageOverride === 'string' ? nextImageOverride : orgImageDraft
    setSavingOrgImage(true)
    setMergeStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}`), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image_url: candidate.trim() || null }),
      })
      if (!resp.ok) {
        let detail = ''
        try {
          const payload = (await resp.json()) as { detail?: string }
          detail = String(payload?.detail || '').trim()
        } catch {
          detail = (await resp.text().catch(() => '')).trim()
        }
        throw new Error(detail || `Update failed (${resp.status})`)
      }
      const updated = (await resp.json()) as { image_url?: string | null }
      const updatedImage = updated?.image_url?.trim() || ''
      setOrg((prev) => (prev ? { ...prev, image_url: updatedImage || null } : prev))
      setOrgImageDraft(updatedImage)
      setMergeStatus('Organization image updated.')
    } catch (err) {
      setMergeStatus(toUserFacingErrorMessage(err, 'Update failed'))
    } finally {
      setSavingOrgImage(false)
    }
  }

  async function handleSaveCroppedOrgImage(base64Image: string) {
    if (!org || !token) return
    setSavingOrgImage(true)
    setMergeStatus(null)
    try {
      const uploadInit = await fetch(pidpUrl('/auth/avatar/upload-url'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!uploadInit.ok) {
        const text = await uploadInit.text().catch(() => '')
        throw new Error(text || `Upload setup failed (${uploadInit.status})`)
      }
      const uploadData = (await uploadInit.json()) as { upload_url: string; public_url: string }
      const dataUrl = `data:image/png;base64,${base64Image}`
      const blob = await fetch(dataUrl).then((r) => r.blob())
      const uploadResp = await fetch(resolveSignedS3UploadUrl(uploadData.upload_url, PIDP_BASE_URL), {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/png',
          Authorization: `Bearer ${token}`,
        },
        body: blob,
      })
      if (!uploadResp.ok) {
        throw new Error(`Image upload failed (${uploadResp.status})`)
      }
      await saveOrganizationImage(uploadData.public_url)
      setShowImageEditor(false)
      setEditorSource(null)
    } catch (err) {
      setMergeStatus(toUserFacingErrorMessage(err, 'Image upload failed'))
    } finally {
      setSavingOrgImage(false)
    }
  }

  async function sendGeneralMessage() {
    const body = generalDraft.trim()
    if (!generalRoom?.room_id || !body || !canPostGeneral || !generalSessionReady) return
    try {
      setSendingGeneral(true)
      setGeneralChatStatus(null)
      await chatService.sendTextMessage(generalRoom.room_id, body)
      setGeneralDraft('')
      const nextMessages = chatService.listMessages(generalRoom.room_id)
      setGeneralLiveMessages(nextMessages)
      writeCachedRoomMessages(generalRoom.room_id, nextMessages)
    } catch (err) {
      setGeneralChatStatus(toUserFacingErrorMessage(err, 'Failed to send message'))
    } finally {
      setSendingGeneral(false)
    }
  }

  function startGeneralEdit(message: ChatMessage) {
    if ((message.messageType ?? 'text') !== 'text') return
    setEditingGeneralMessageId(message.id)
    setGeneralEditDraft(message.body)
    setOpenGeneralMenuMessageId(null)
  }

  function cancelGeneralEdit() {
    setEditingGeneralMessageId(null)
    setGeneralEditDraft('')
  }

  async function saveGeneralEdit() {
    const body = generalEditDraft.trim()
    if (!generalRoom?.room_id || !editingGeneralMessageId || !body || !generalSessionReady) return
    try {
      setGeneralActionPending(true)
      setGeneralChatStatus(null)
      await chatService.editMessage(generalRoom.room_id, editingGeneralMessageId, body)
      const nextMessages = chatService.listMessages(generalRoom.room_id)
      setGeneralLiveMessages(nextMessages)
      writeCachedRoomMessages(generalRoom.room_id, nextMessages)
      cancelGeneralEdit()
    } catch (err) {
      setGeneralChatStatus(toUserFacingErrorMessage(err, 'Failed to edit message'))
    } finally {
      setGeneralActionPending(false)
    }
  }

  async function deleteGeneralMessage(messageId: string) {
    if (!generalRoom?.room_id || !generalSessionReady) return
    try {
      setGeneralActionPending(true)
      setGeneralChatStatus(null)
      await chatService.deleteMessage(generalRoom.room_id, messageId)
      setOpenGeneralMenuMessageId(null)
      const nextMessages = chatService.listMessages(generalRoom.room_id)
      setGeneralLiveMessages(nextMessages)
      writeCachedRoomMessages(generalRoom.room_id, nextMessages)
    } catch (err) {
      setGeneralChatStatus(toUserFacingErrorMessage(err, 'Failed to delete message'))
    } finally {
      setGeneralActionPending(false)
    }
  }

  async function reactToGeneralMessage(messageId: string, emoji: string) {
    if (!generalRoom?.room_id || !generalSessionReady) return
    try {
      setGeneralActionPending(true)
      setGeneralChatStatus(null)
      await chatService.sendReaction(generalRoom.room_id, messageId, emoji)
      setOpenGeneralMenuMessageId(null)
      const nextMessages = chatService.listMessages(generalRoom.room_id)
      setGeneralLiveMessages(nextMessages)
      writeCachedRoomMessages(generalRoom.room_id, nextMessages)
    } catch (err) {
      setGeneralChatStatus(toUserFacingErrorMessage(err, 'Failed to send reaction'))
    } finally {
      setGeneralActionPending(false)
    }
  }

  if (!org) {
    return (
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>Organization</h1>
        <p className="muted">{status}</p>
        <Link to="/">Back to home</Link>
      </section>
    )
  }

  const mergeCandidates = myAdminOrgs.filter((item) => item.id !== org.id)
  const canEditOrgImage = canManageCurrentOrg && adminView
  const heroImageSource = org.image_url?.trim() || ORG_PLACEHOLDER_SRC

  function openImageEditor() {
    if (!canEditOrgImage) return
    setEditorSource(heroImageSource)
    setShowImageEditor(true)
  }

  return (
    <section className="panel portal-org-page">
      <div className="portal-org-layout">
        <div className="portal-org-main-column">
          <div className="portal-org-hero">
            <div className="portal-org-hero-header">
              <h1 style={{ marginTop: 0, marginBottom: 0 }}>{org.name}</h1>
              {canEditOrgImage ? (
                <span className="portal-org-image-hint">Click image to change</span>
              ) : null}
            </div>
            <button
              type="button"
              className={`portal-org-image-button${canEditOrgImage ? ' editable' : ''}`}
              onClick={openImageEditor}
              disabled={!canEditOrgImage}
              aria-label={canEditOrgImage ? 'Change organization image' : 'Organization image'}
            >
              <OrgImage
                src={org.image_url}
                alt={org.name}
                className="portal-org-hero-image"
              />
            </button>
          </div>
          {mergedFrom ? (
            <p className="muted" role="status" style={{ margin: 0 }}>
              Redirected from merged organization <code>{mergedFrom}</code>.
            </p>
          ) : null}
          <div className="portal-org-meta">
            {org.description ? <p style={{ margin: 0 }}>{org.description}</p> : null}
            <p className="muted" style={{ margin: 0 }}>
              Handle: <code>{org.slug}</code>
            </p>
          </div>
          <div className="portal-card" style={{ display: 'grid', gap: '0.8rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem' }}>
              <div>
                <strong>{org.membership_count || 0}</strong>
                <p className="muted" style={{ margin: 0 }}>Members</p>
              </div>
              <div>
                <strong>{org.upcoming_events_count}</strong>
                <p className="muted" style={{ margin: 0 }}>Upcoming events</p>
              </div>
              <div>
                <strong>{org.feedback_count || 0}</strong>
                <p className="muted" style={{ margin: 0 }}>Feedback notes</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {membership?.status === 'active' ? (
                membership.role === 'member' ? (
                  <button type="button" onClick={() => void updateOrganizationMembership(false)}>
                    Leave Group
                  </button>
                ) : (
                  <span className="pill">You manage this group</span>
                )
              ) : (
                <button type="button" className="btn-primary" onClick={() => void updateOrganizationMembership(true)}>
                  Join Group
                </button>
              )}
              {token ? (
                <Link className="btn-primary" to={`/chat?start=group&org=${encodeURIComponent(org.slug)}`} style={{ textDecoration: 'none', width: 'fit-content' }}>
                  Message Group
                </Link>
              ) : (
                <a className="btn-primary" href={pidpAppLoginUrl(`/chat?start=group&org=${encodeURIComponent(org.slug)}`)} style={{ textDecoration: 'none', width: 'fit-content' }}>
                  Message Group
                </a>
              )}
              {!token ? <span className="muted">Sign in to join and leave feedback.</span> : null}
            </div>
            {membershipStatus ? <p className="muted" role="status" style={{ margin: 0 }}>{membershipStatus}</p> : null}
          </div>
          <div className="portal-card" style={{ display: 'grid', gap: '0.65rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem' }}>Group Feedback</h2>
              <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                {org.feedback_positive_count || 0} positive • {org.feedback_concern_count || 0} concerns
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }} role="group" aria-label={`Feedback rating for ${org.name}`}>
              {(['positive', 'neutral', 'concern'] as FeedbackRating[]).map((rating) => (
                <button
                  key={rating}
                  type="button"
                  className={feedbackRating === rating ? 'btn-primary' : undefined}
                  onClick={() => setFeedbackRating(rating)}
                  disabled={!token}
                  aria-pressed={feedbackRating === rating}
                >
                  {rating === 'positive' ? 'Positive' : rating === 'concern' ? 'Concern' : 'Neutral'}
                </button>
              ))}
            </div>
            <textarea
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              placeholder="Share context, praise, concerns, or what would help you participate."
              rows={3}
              disabled={!token}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                color: 'var(--text-primary)',
              }}
            />
            <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="btn-primary" onClick={() => void saveOrganizationFeedback()} disabled={!token}>
                Save Feedback
              </button>
              <button type="button" onClick={() => void clearOrganizationFeedback()} disabled={!token || (!feedbackComment && feedbackRating === 'neutral')}>
                Clear
              </button>
              {!token ? <a href={pidpAppLoginUrl(`/orgs/${encodeURIComponent(org.slug)}`)}>Sign in to respond</a> : null}
            </div>
            {feedbackStatus ? <p className="muted" role="status" style={{ margin: 0 }}>{feedbackStatus}</p> : null}
          </div>
          {org.is_disputed ? (
            <p className="muted" style={{ margin: 0 }}>
              Ownership status: Disputed ({org.pending_challenges_count} open challenge{org.pending_challenges_count === 1 ? '' : 's'}).
            </p>
          ) : null}
          {org.tags && org.tags.length ? (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {org.tags.map((tag) => (
                <span key={tag} className="pill">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {org.source_url ? (
            <p style={{ margin: 0 }}>
              <a href={org.source_url} target="_blank" rel="noreferrer">
                Source website
              </a>
            </p>
          ) : null}
          <div className="portal-card" style={{ display: 'grid', gap: '0.55rem' }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Organization Admins</h2>
            {adminsLoading ? (
              <p className="muted" style={{ margin: 0 }}>
                Loading admins…
              </p>
            ) : admins.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No admins listed yet.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {admins.map((admin) => (
                  <li key={`${admin.user_id}-${admin.role}`}>
                    <strong>{admin.user_name || admin.user_id}</strong>{' '}
                    <span className="muted">({admin.role})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!canManageCurrentOrg ? (
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={claimOrganizationBySlug} disabled={claiming || !token}>
                {claiming ? 'Submitting…' : claimActionLabel}
              </button>
              {!token ? <span className="muted">Sign in to continue.</span> : null}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              You already administer this organization.
            </p>
          )}
          {claimStatus ? (
            <p className="muted" role="status" style={{ margin: 0 }}>
              {claimStatus}
            </p>
          ) : null}
          {hasExistingAdmins && !canManageCurrentOrg ? (
            <div style={{ display: 'grid', gap: '0.45rem', maxWidth: 680 }}>
              <label htmlFor="claim-request-message" className="muted">
                Ownership challenge
              </label>
              <textarea
                id="claim-request-message"
                value={claimRequestMessage}
                onChange={(e) => setClaimRequestMessage(e.target.value)}
                placeholder="Explain why ownership should transfer to you."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          ) : null}

          {canManageCurrentOrg ? (
            <div className="portal-card portal-org-admin-card" style={{ display: 'grid', gap: '0.7rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '1rem' }}>Admin Controls</h2>
                <button type="button" onClick={() => setAdminView((prev) => !prev)}>
                  {adminView ? 'View as User' : 'View as Admin'}
                </button>
              </div>
              {adminView ? (
                <>
                  <p className="muted" style={{ margin: 0 }}>
                    You are an admin of this organization.
                  </p>
                  {myAdminOrgsStatus ? (
                    <p className="muted" style={{ margin: 0 }}>
                      {myAdminOrgsStatus}
                    </p>
                  ) : null}
                  <div className="portal-card portal-org-portal-setup" style={{ display: 'grid', gap: '0.65rem', boxShadow: 'none' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '0.98rem' }}>Portal</h3>
                      <p className="muted" style={{ margin: '0.2rem 0 0' }}>
                        Publish an organization portal at a shared slug URL. A custom domain can be attached to the same portal later.
                      </p>
                    </div>
                    <div className="portal-org-portal-grid">
                      <label>
                        <span className="muted">Slug URL</span>
                        <input
                          value={portalSlugDraft}
                          onChange={(e) => setPortalSlugDraft(normalizePortalSlug(e.target.value))}
                          placeholder={org.slug}
                        />
                      </label>
                      <label>
                        <span className="muted">Home mode</span>
                        <select
                          value={portalHomeKindDraft || 'landing'}
                          onChange={(e) => setPortalHomeKindDraft(e.target.value as OrganizationPortal['home_kind'])}
                        >
                          <option value="landing">Landing</option>
                          <option value="org-events">Org events</option>
                          <option value="org">Org profile</option>
                          <option value="auth">Member flow</option>
                        </select>
                      </label>
                    </div>
                    {portalConfig?.slug_url ? (
                      <p className="muted" style={{ margin: 0 }}>
                        Portal URL: <a href={portalConfig.slug_url}>{portalConfig.slug_url}</a>
                      </p>
                    ) : (
                      <p className="muted" style={{ margin: 0 }}>
                        Portal URL will be available after saving.
                      </p>
                    )}
                    <div className="portal-org-domain-flow">
                      <div>
                        <h4 style={{ margin: 0, fontSize: '0.92rem' }}>Custom domain</h4>
                        <p className="muted" style={{ margin: '0.15rem 0 0' }}>
                          Status: {portalConfig?.custom_domain_status || 'none'}
                        </p>
                      </div>
                      <div className="portal-org-portal-grid">
                        <label>
                          <span className="muted">Domain</span>
                          <input
                            value={portalDomainDraft}
                            onChange={(e) => setPortalDomainDraft(normalizeDomain(e.target.value))}
                            placeholder="example.org"
                          />
                        </label>
                        <label>
                          <span className="muted">Operator notes</span>
                          <input
                            value={portalDomainNotesDraft}
                            onChange={(e) => setPortalDomainNotesDraft(e.target.value)}
                            placeholder="DNS owner, deadline, provider notes"
                          />
                        </label>
                      </div>
                      {portalDomainChecklist.length ? (
                        <ol className="portal-org-domain-checklist">
                          {portalDomainChecklist.map((item) => <li key={item}>{item}</li>)}
                        </ol>
                      ) : null}
                      <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => void updatePortalCustomDomain('request')}
                          disabled={savingPortalDomain || !portalConfig}
                        >
                          Request Domain
                        </button>
                        <button
                          type="button"
                          onClick={() => void updatePortalCustomDomain('attach')}
                          disabled={savingPortalDomain || !portalConfig}
                        >
                          Attach Provisioned Domain
                        </button>
                      </div>
                    </div>
                    <div className="portal-org-portal-grid">
                      <label>
                        <span className="muted">Portal name</span>
                        <input
                          value={portalNameDraft}
                          onChange={(e) => setPortalNameDraft(e.target.value)}
                          placeholder={org.name}
                        />
                      </label>
                      <label>
                        <span className="muted">Tagline</span>
                        <input
                          value={portalTaglineDraft}
                          onChange={(e) => setPortalTaglineDraft(e.target.value)}
                          placeholder="Short portal tagline"
                        />
                      </label>
                    </div>
                    <label>
                      <span className="muted">Heading</span>
                      <input
                        value={portalHeadingDraft}
                        onChange={(e) => setPortalHeadingDraft(e.target.value)}
                        placeholder={org.name}
                      />
                    </label>
                    <label>
                      <span className="muted">Description</span>
                      <textarea
                        value={portalDescriptionDraft}
                        onChange={(e) => setPortalDescriptionDraft(e.target.value)}
                        rows={3}
                        placeholder="Describe what members and visitors can do here."
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--panel)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </label>
                    <label>
                      <span className="muted">Hero image URL</span>
                      <input
                        value={portalImageDraft}
                        onChange={(e) => setPortalImageDraft(e.target.value)}
                        placeholder="https://example.com/hero.jpg"
                      />
                    </label>
                    <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button type="button" className="btn-primary" onClick={() => void saveOrganizationPortal()} disabled={savingPortal}>
                        {savingPortal ? 'Saving...' : 'Save Portal'}
                      </button>
                      {portalStatus ? <p className="muted" role="status" style={{ margin: 0 }}>{portalStatus}</p> : null}
                    </div>
                  </div>
                  <div className="portal-card" style={{ display: 'grid', gap: '0.55rem', boxShadow: 'none' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '0.98rem' }}>Feedback Inbox</h3>
                      <p className="muted" style={{ margin: '0.2rem 0 0' }}>
                        {feedbackReviews.length} response{feedbackReviews.length === 1 ? '' : 's'} visible to organization admins.
                      </p>
                    </div>
                    {feedbackReviewStatus ? (
                      <p className="muted" style={{ margin: 0 }}>{feedbackReviewStatus}</p>
                    ) : feedbackReviews.length ? (
                      <div style={{ display: 'grid', gap: '0.55rem' }}>
                        {feedbackReviews.map((item) => (
                          <article
                            key={`${item.user_id}-${item.updated_at}`}
                            style={{
                              display: 'grid',
                              gap: '0.35rem',
                              padding: '0.65rem',
                              border: '1px solid var(--border)',
                              borderRadius: 8,
                            }}
                          >
                            <p style={{ margin: 0 }}>
                              <strong>{item.user_name || item.user_id}</strong>{' '}
                              <span className="pill">{item.rating === 'positive' ? 'Positive' : item.rating === 'concern' ? 'Concern' : 'Neutral'}</span>
                            </p>
                            {item.comment ? <p style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.comment}</p> : (
                              <p className="muted" style={{ margin: 0 }}>No written note.</p>
                            )}
                            <p className="muted" style={{ margin: 0 }}>{formatDate(item.updated_at)}</p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="muted" style={{ margin: 0 }}>No feedback yet.</p>
                    )}
                  </div>
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    <label htmlFor="org-name" className="muted">
                      Organization name
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        id="org-name"
                        value={orgNameDraft}
                        onChange={(e) => setOrgNameDraft(e.target.value)}
                        placeholder="Organization name"
                        style={{ minWidth: 0, maxWidth: '100%', flex: '1 1 240px' }}
                      />
                      <button type="button" onClick={saveOrganizationName} disabled={savingOrgName || !orgNameDraft.trim()}>
                        {savingOrgName ? 'Saving…' : 'Save Name'}
                      </button>
                    </div>
                    <label htmlFor="org-image-url" className="muted">
                      Organization image URL
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        id="org-image-url"
                        value={orgImageDraft}
                        onChange={(e) => setOrgImageDraft(e.target.value)}
                        placeholder="https://example.com/org-image.png"
                        style={{ minWidth: 0, maxWidth: '100%', flex: '1 1 240px' }}
                      />
                      <button type="button" onClick={() => void saveOrganizationImage()} disabled={savingOrgImage}>
                        {savingOrgImage ? 'Saving…' : 'Save Image'}
                      </button>
                    </div>
                    <label htmlFor="merge-source-org" className="muted">
                      Merge one of your organizations into this one
                    </label>
                    <select
                      id="merge-source-org"
                      value={mergeSourceOrgId}
                      onChange={(e) => setMergeSourceOrgId(e.target.value)}
                      style={{ maxWidth: 420 }}
                    >
                      <option value="">Select organization</option>
                      {mergeCandidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </option>
                      ))}
                    </select>
                    <div>
                      <button type="button" onClick={mergeOrgIntoCurrent} disabled={merging || !mergeSourceOrgId}>
                        {merging ? 'Merging…' : 'Merge Into This Org'}
                      </button>
                    </div>
                    {mergeStatus ? (
                      <p className="muted" role="status" style={{ margin: 0 }}>
                        {mergeStatus}
                      </p>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  User preview mode is active. Admin controls are hidden.
                </p>
              )}
            </div>
          ) : null}

          <div className="portal-card" style={{ display: 'grid', gap: '0.6rem' }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Hosted Events</h2>
            {eventsLoading ? (
              <p className="muted" style={{ margin: 0 }}>
                Loading events…
              </p>
            ) : events.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No hosted events listed.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {events.map((event) => (
                  <article key={event.id} style={{ display: 'grid', gap: '0.25rem' }}>
                    {event.image_url ? (
                      <img
                        src={event.image_url}
                        alt={event.title}
                        style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }}
                      />
                    ) : null}
                    <Link to={`/events/${event.slug}`} style={{ fontWeight: 700, textDecoration: 'none' }}>
                      {event.title}
                    </Link>
                    <span className="muted">{formatDate(event.starts_at)}{event.location ? ` • ${event.location}` : ''}</span>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
        <aside className="portal-org-chat-column">
          <div className="portal-card" style={{ display: 'grid', gap: '0.55rem' }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Public Chat</h2>
            {chatFeedLoading && !publicChatFeed?.rooms?.length ? (
              <p className="muted" style={{ margin: 0 }}>
                Loading chat…
              </p>
            ) : null}
            <section className="portal-card" style={{ display: 'grid', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.98rem' }}>Public Chat</h3>
              {chatFeedLoading && !generalRoom?.room_id ? (
                <p className="muted" style={{ margin: 0 }}>Loading public chat room…</p>
              ) : generalRoom?.room_id ? (
                <>
                  <p className="muted" style={{ margin: 0 }}>
                    {generalRoom.room_name || 'Public Chat'}
                    {generalRoom.room_alias ? ` • ${generalRoom.room_alias}` : ''}
                  </p>
                  {!generalLiveEnabled && token ? (
                    <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setGeneralLiveEnabled(true)}
                      >
                        Enable Live Chat
                      </button>
                      <span className="muted">Feed is cached until live mode is enabled.</span>
                    </div>
                  ) : null}
                  {generalChatStatus ? <p className="muted" style={{ margin: 0 }}>{generalChatStatus}</p> : null}
                  <div
                    style={{
                      maxHeight: 340,
                      overflowY: 'auto',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: '0.55rem',
                      display: 'grid',
                      gap: '0.45rem',
                      background: 'rgba(0,0,0,0.08)',
                    }}
                  >
                    {renderedGeneralMessages.length === 0 ? (
                      <p className="muted" style={{ margin: 0 }}>No messages yet.</p>
                    ) : (
                      renderedGeneralMessages.map((message) => {
                        const isMine = Boolean(myUserId && message.sender === myUserId)
                        const isEditing = editingGeneralMessageId === message.id
                        return (
                          <article
                            key={message.id}
                            style={{ borderLeft: '2px solid var(--border)', paddingLeft: '0.55rem', display: 'grid', gap: '0.35rem' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.4rem', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                                <span className="portal-avatar" style={{ width: 22, height: 22, fontSize: '0.62rem', flex: '0 0 auto' }}>
                                  {message.senderAvatarUrl ? (
                                    <img src={message.senderAvatarUrl} alt={messageAuthorLabel(message, myUserId)} />
                                  ) : (
                                    messageAuthorInitial(message, myUserId)
                                  )}
                                </span>
                                <p className="muted" style={{ margin: 0 }}>
                                  {messageAuthorLabel(message, myUserId)} • {new Date(message.ts).toLocaleString()}
                                  {message.edited ? ' • edited' : ''}
                                </p>
                              </div>
                              {isMine && generalSessionReady ? (
                                <div style={{ position: 'relative' }}>
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() =>
                                      setOpenGeneralMenuMessageId((prev) => (prev === message.id ? null : message.id))
                                    }
                                    aria-label="Message options"
                                    style={{ padding: '0.15rem 0.4rem', minWidth: 'auto' }}
                                  >
                                    ⋯
                                  </button>
                                  {openGeneralMenuMessageId === message.id ? (
                                    <div
                                      className="portal-chat-card-menu"
                                      style={{
                                        position: 'absolute',
                                        right: 0,
                                        top: 'calc(100% + 0.25rem)',
                                        zIndex: 5,
                                        border: '1px solid var(--border)',
                                        borderRadius: 10,
                                        background: 'var(--panel)',
                                        boxShadow: '0 8px 20px rgba(0,0,0,0.22)',
                                        padding: '0.35rem',
                                        display: 'grid',
                                        gap: '0.25rem',
                                        minWidth: 120,
                                      }}
                                    >
                                      <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={() => startGeneralEdit(message)}
                                        disabled={(message.messageType ?? 'text') !== 'text' || generalActionPending}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={() => {
                                          deleteGeneralMessage(message.id).catch(() => {})
                                        }}
                                        disabled={generalActionPending}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            {isEditing ? (
                              <div style={{ display: 'grid', gap: '0.35rem' }}>
                                <textarea
                                  value={generalEditDraft}
                                  onChange={(event) => setGeneralEditDraft(event.target.value)}
                                  rows={3}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' && !event.shiftKey) {
                                      event.preventDefault()
                                      saveGeneralEdit().catch(() => {})
                                    }
                                  }}
                                  disabled={generalActionPending}
                                  style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: 10,
                                    border: '1px solid var(--border)',
                                    background: 'var(--panel)',
                                    color: 'var(--text-primary)',
                                  }}
                                />
                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={() => {
                                      saveGeneralEdit().catch(() => {})
                                    }}
                                    disabled={!generalEditDraft.trim() || generalActionPending}
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={cancelGeneralEdit}
                                    disabled={generalActionPending}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.body}</p>
                            )}
                            {generalSessionReady ? (
                              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                {QUICK_REACTIONS.map((emoji) => {
                                  const count =
                                    message.reactions?.find((reaction) => reaction.key === emoji)?.count || 0
                                  return (
                                    <button
                                      key={`${message.id}-${emoji}`}
                                      type="button"
                                      className="btn-secondary"
                                      onClick={() => {
                                        reactToGeneralMessage(message.id, emoji).catch(() => {})
                                      }}
                                      disabled={generalActionPending}
                                      style={{ padding: '0.15rem 0.45rem', minWidth: 'auto' }}
                                    >
                                      {emoji} {count > 0 ? count : ''}
                                    </button>
                                  )
                                })}
                              </div>
                            ) : null}
                          </article>
                        )
                      })
                    )}
                  </div>
                  <div style={{ display: 'grid', gap: '0.45rem' }}>
                    <textarea
                      value={generalDraft}
                      onChange={(event) => setGeneralDraft(event.target.value)}
                      placeholder={
                        !token
                          ? 'Sign in to post.'
                          : generalSessionReady
                            ? 'Write a message…'
                            : 'Connecting chat…'
                      }
                      rows={3}
                      disabled={!canPostGeneral || !generalSessionReady || sendingGeneral || generalActionPending}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault()
                          sendGeneralMessage().catch(() => {})
                        }
                      }}
                      onFocus={() => {
                        if (token && !generalLiveEnabled) setGeneralLiveEnabled(true)
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: 'var(--panel)',
                        color: 'var(--text-primary)',
                        resize: 'vertical',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => {
                          sendGeneralMessage().catch(() => {})
                        }}
                        disabled={!canPostGeneral || !generalSessionReady || sendingGeneral || generalActionPending || !generalDraft.trim()}
                      >
                        {sendingGeneral ? 'Sending…' : 'Send to Public Chat'}
                      </button>
                      {!token ? <span className="muted">Sign in to post.</span> : null}
                    </div>
                  </div>
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>Public chat room not found.</p>
              )}
            </section>

            <section className="portal-card" style={{ display: 'grid', gap: '0.45rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.98rem' }}>Announcements</h3>
              {chatFeedLoading && !announcementsRoom?.room_id ? (
                <p className="muted" style={{ margin: 0 }}>Loading announcements room…</p>
              ) : announcementsRoom?.room_id ? (
                <>
                  <p className="muted" style={{ margin: 0 }}>
                    {announcementsRoom.room_name || 'Announcements'}
                    {announcementsRoom.room_alias ? ` • ${announcementsRoom.room_alias}` : ''}
                  </p>
                  {announcementsRoom.messages.length > 0 ? (
                    <div style={{ display: 'grid', gap: '0.4rem' }}>
                      {announcementsRoom.messages.map((message) => (
                        <article key={message.event_id} style={{ borderLeft: '2px solid var(--border)', paddingLeft: '0.55rem' }}>
                          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.body}</p>
                          <p className="muted" style={{ margin: 0 }}>
                            {message.sender || 'Unknown'} • {formatDate(message.sent_at)}
                          </p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="muted" style={{ margin: 0 }}>No recent messages.</p>
                  )}
                  {token && announcementsRoom.room_id ? (
                    <Link
                      className="btn-secondary"
                      to={`/chat/${encodeURIComponent(announcementsRoom.room_id)}`}
                      style={{ textDecoration: 'none', width: 'fit-content' }}
                    >
                      Open Announcements
                    </Link>
                  ) : null}
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>Announcements room not found.</p>
              )}
            </section>

            {!publicChatFeed?.rooms?.length ? (
              <p className="muted" style={{ margin: 0 }}>
                No public org rooms discovered yet.
              </p>
            ) : null}
          </div>
        </aside>
      </div>
      {showImageEditor && editorSource ? (
        <ImageEditorModal
          image={editorSource}
          onClose={() => {
            if (savingOrgImage) return
            setShowImageEditor(false)
            setEditorSource(null)
          }}
          onSave={handleSaveCroppedOrgImage}
        />
      ) : null}
    </section>
  )
}
