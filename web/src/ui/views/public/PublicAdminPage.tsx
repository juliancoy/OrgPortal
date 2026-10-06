import { groupOrganizationEvents } from './organizationEvents'
import { EmbeddedOrganizationChat } from '../../components/EmbeddedOrganizationChat'
import { PeerOrganizations } from '../../components/PeerOrganizations'
import { OrganizationMembers } from '../../components/OrganizationMembers'
import { resolveOrganizationView, useOrganizationViewPreference } from '../../hooks/useOrganizationView'
import { OrganizationPortalSections } from '../../components/OrganizationPortalSections'
import { OrganizationBrandGuide } from '../../components/OrganizationBrandGuide'
import { getDomainTenant } from '../../../config/timebankCommunity'
import { OrganizationSupport } from '../../components/OrganizationSupport'
import { OrganizationTools } from '../../components/OrganizationTools'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Pencil, X } from 'lucide-react'
import { setSeoMeta, upsertJsonLd } from '../../utils/seo'
import { useAuth } from '../../../app/AppProviders'
import { PIDP_BASE_URL, pidpAppLoginUrl, pidpUrl } from '../../../config/pidp'
import { OrgImage } from '../../components/media/OrgImage'
import { ImageEditorModal } from '../../components/media/ImageEditorModal'
import { resolveSignedS3UploadUrl } from '../../../infrastructure/auth/avatarUpload'
import { toUserFacingErrorMessage } from '../../../infrastructure/http/userFacingError'

const ORG_API_BASE = '/api/org'
const ORG_PLACEHOLDER_SRC = '/images/org-placeholder.svg'

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
  home_kind?: 'default' | 'main' | 'landing' | 'route' | 'org' | 'org-events' | 'timebank' | 'auth' | null
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
  event_date?: string | null
  host_org_id?: string | null
  organization_slug?: string | null
  location?: string | null
  image_url?: string | null
  media?: EventMediaItem[]
}

type EventMediaItem = {
  id: string
  url: string
  label: string
  alt: string
  kind: 'image'
}

type PublicOrgAdmin = {
  user_id: string
  user_name?: string | null
  role: string
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

export function PublicAdminPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const { handle } = useParams()
  const [searchParams] = useSearchParams()
  const [org, setOrg] = useState<PublicOrganization | null>(null)
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [admins, setAdmins] = useState<PublicOrgAdmin[]>([])
  const [adminsLoading, setAdminsLoading] = useState(false)
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
  const [orgDescriptionDraft, setOrgDescriptionDraft] = useState('')
  const [orgImageDraft, setOrgImageDraft] = useState('')
  const [savingOrgName, setSavingOrgName] = useState(false)
  const [savingOrgImage, setSavingOrgImage] = useState(false)
  const [eventMediaStatus, setEventMediaStatus] = useState<Record<string, string>>({})
  const [eventMediaUrlDrafts, setEventMediaUrlDrafts] = useState<Record<string, string>>({})
  const [eventMediaLabelDrafts, setEventMediaLabelDrafts] = useState<Record<string, string>>({})
  const [eventMediaPending, setEventMediaPending] = useState<Record<string, boolean>>({})
  const [adminView, setAdminView] = useState(false)
  const organizationEditorRef = useRef<HTMLDivElement | null>(null)
  const [showImageEditor, setShowImageEditor] = useState(false)
  const [editorSource, setEditorSource] = useState<string | null>(null)
  const hasExistingAdmins = admins.some((admin) => admin.role === 'administrator' || admin.role === 'owner')
  const canManageCurrentOrg = myAdminOrgs.some((item) => item.id === org?.id)
  const requestedView = useOrganizationViewPreference(org?.slug, searchParams.get('view'))
  const organizationView = resolveOrganizationView(requestedView, canManageCurrentOrg, membership?.status === 'active')
  const isOrganizerView = canManageCurrentOrg && organizationView === 'organizers'
  const claimActionLabel = hasExistingAdmins ? 'Challenge Ownership' : 'Claim This Organization'
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
        setOrgDescriptionDraft(orgData.description || '')
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
        setStatus('')
      })
      .catch((err) => {
        setOrg(null)
        setEvents([])
        setAdmins([])
        setStatus(toUserFacingErrorMessage(err, 'Organization unavailable'))
      })
  }, [handle, navigate])

  useEffect(() => {
    if (!org?.slug) return
    let cancelled = false
    setEventsLoading(true)
    setAdminsLoading(true)
    Promise.all([
      fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(org.slug)}/events?upcoming_only=true&limit=200`)).then(
        async (resp) => {
          if (!resp.ok) return []
          return (await resp.json()) as PublicEvent[]
        },
      ),
      fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(org.slug)}/admins`)).then(async (resp) => {
        if (!resp.ok) return []
        return (await resp.json()) as PublicOrgAdmin[]
      }),
    ])
      .then(([eventData, adminData]) => {
        if (cancelled) return
        setEvents(Array.isArray(eventData) ? eventData : [])
        setAdmins(Array.isArray(adminData) ? adminData : [])
      })
      .finally(() => {
        if (cancelled) return
        setEventsLoading(false)
        setAdminsLoading(false)
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
      const claimed = await resp.json() as PublicOrganization & MyOrganization
      setOrg(claimed)
      setMyAdminOrgs(previous => [...previous.filter(item => item.id !== claimed.id), claimed])
      setMembership({ organization_id: claimed.id, role: 'owner', status: 'active', membership_count: claimed.membership_count || 1 })
      window.dispatchEvent(new Event('organization-access-change'))
      setClaimStatus('Organization claimed. You are now an organizer and its owner.')
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

  async function saveOrganizationSettings() {
    if (!org || !token) {
      setMergeStatus('Sign in to update this organization.')
      return
    }
    const nextName = orgNameDraft.trim()
    if (!nextName) {
      setMergeStatus('Organization name is required.')
      return
    }
    const slug = normalizePortalSlug(portalSlugDraft || org.slug)
    if (!slug || slug.length < 3) {
      setPortalStatus('Use a portal slug with at least 3 characters.')
      return
    }
    setSavingOrgName(true)
    setSavingOrgImage(true)
    setSavingPortal(true)
    setMergeStatus(null)
    setPortalStatus(null)
    try {
      const orgResp = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}`), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: nextName,
          description: orgDescriptionDraft.trim(),
          image_url: orgImageDraft.trim() || null,
        }),
      })
      if (!orgResp.ok) {
        let detail = ''
        try {
          const payload = (await orgResp.json()) as { detail?: string }
          detail = String(payload?.detail || '').trim()
        } catch {
          detail = (await orgResp.text().catch(() => '')).trim()
        }
        throw new Error(detail || `Organization update failed (${orgResp.status})`)
      }
      const updatedOrg = (await orgResp.json()) as { name?: string; description?: string | null; image_url?: string | null }
      const updatedName = String(updatedOrg?.name || nextName)
      const updatedDescription = updatedOrg?.description?.trim() || ''
      const updatedImage = updatedOrg?.image_url?.trim() || orgImageDraft.trim() || ''
      setOrg((prev) => (prev ? { ...prev, name: updatedName, description: updatedDescription, image_url: updatedImage || null } : prev))
      setMyAdminOrgs((prev) => prev.map((row) => (row.id === org.id ? { ...row, name: updatedName, image_url: updatedImage || null } : row)))
      setOrgNameDraft(updatedName)
      setOrgDescriptionDraft(updatedDescription)
      setOrgImageDraft(updatedImage)

      const portalResp = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/portal`), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slug,
          name: portalNameDraft || updatedName,
          tagline: portalTaglineDraft || org.description || `Portal for ${updatedName}`,
          home_kind: portalHomeKindDraft || 'main',
          home_heading: portalHeadingDraft || portalNameDraft || updatedName,
          home_description: portalDescriptionDraft || portalTaglineDraft || org.description || '',
          home_image_url: portalImageDraft || updatedImage || null,
          features: ['directory', 'events', 'chat'],
        }),
      })
      if (!portalResp.ok) {
        const text = await portalResp.text().catch(() => '')
        throw new Error(text || `Portal update failed (${portalResp.status})`)
      }
      const payload = (await portalResp.json()) as { portal: OrganizationPortal }
      setPortalConfig(payload.portal)
      setPortalSlugDraft(normalizePortalSlug(payload.portal.slug || slug))
      setPortalStatus('Organization settings saved.')
      setMergeStatus('Organization settings saved.')
    } catch (err) {
      const message = toUserFacingErrorMessage(err, 'Could not save organization settings')
      setPortalStatus(message)
      setMergeStatus(message)
    } finally {
      setSavingOrgName(false)
      setSavingOrgImage(false)
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
      setOrgImageDraft(uploadData.public_url)
      setMergeStatus('Image uploaded. Save organization settings to publish it.')
      setShowImageEditor(false)
      setEditorSource(null)
    } catch (err) {
      setMergeStatus(toUserFacingErrorMessage(err, 'Image upload failed'))
    } finally {
      setSavingOrgImage(false)
    }
  }

  function updateEventInList(updated: PublicEvent) {
    setEvents((prev) => prev.map((event) => (event.id === updated.id ? updated : event)))
  }

  async function saveEventMediaList(event: PublicEvent, media: EventMediaItem[]) {
    if (!token) {
      setEventMediaStatus((prev) => ({ ...prev, [event.id]: 'Sign in to manage event media.' }))
      return
    }
    setEventMediaPending((prev) => ({ ...prev, [event.id]: true }))
    setEventMediaStatus((prev) => ({ ...prev, [event.id]: '' }))
    try {
      const resp = await fetch(orgUrl(`/api/network/events/${encodeURIComponent(event.id)}/media`), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ media }),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Media update failed (${resp.status})`)
      }
      updateEventInList((await resp.json()) as PublicEvent)
      setEventMediaStatus((prev) => ({ ...prev, [event.id]: 'Event media updated.' }))
    } catch (err) {
      setEventMediaStatus((prev) => ({ ...prev, [event.id]: toUserFacingErrorMessage(err, 'Event media update failed') }))
    } finally {
      setEventMediaPending((prev) => ({ ...prev, [event.id]: false }))
    }
  }

  async function addEventMediaUrl(event: PublicEvent) {
    const url = (eventMediaUrlDrafts[event.id] || '').trim()
    if (!url) {
      setEventMediaStatus((prev) => ({ ...prev, [event.id]: 'Enter an image URL first.' }))
      return
    }
    const label = (eventMediaLabelDrafts[event.id] || '').trim() || 'Event image'
    await saveEventMediaList(event, [
      ...(event.media || []),
      { id: crypto.randomUUID(), url, label, alt: label, kind: 'image' },
    ])
    setEventMediaUrlDrafts((prev) => ({ ...prev, [event.id]: '' }))
    setEventMediaLabelDrafts((prev) => ({ ...prev, [event.id]: '' }))
  }

  async function uploadEventMediaFile(event: PublicEvent, file: File | null) {
    if (!file) return
    if (!token) {
      setEventMediaStatus((prev) => ({ ...prev, [event.id]: 'Sign in to upload event media.' }))
      return
    }
    setEventMediaPending((prev) => ({ ...prev, [event.id]: true }))
    setEventMediaStatus((prev) => ({ ...prev, [event.id]: '' }))
    try {
      const formData = new FormData()
      formData.append('image', file)
      formData.append('label', file.name.replace(/\.[^.]+$/, '') || 'Event image')
      const resp = await fetch(orgUrl(`/api/network/events/${encodeURIComponent(event.id)}/media`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Upload failed (${resp.status})`)
      }
      updateEventInList((await resp.json()) as PublicEvent)
      setEventMediaStatus((prev) => ({ ...prev, [event.id]: 'Event media uploaded.' }))
    } catch (err) {
      setEventMediaStatus((prev) => ({ ...prev, [event.id]: toUserFacingErrorMessage(err, 'Event media upload failed') }))
    } finally {
      setEventMediaPending((prev) => ({ ...prev, [event.id]: false }))
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
  const canEditOrgImage = isOrganizerView && adminView
  const heroImageSource = org.image_url?.trim() || ORG_PLACEHOLDER_SRC
  const eventGroups = groupOrganizationEvents(events, org).map(group => ({
    ...group, events: group.events.slice(0, 3),
  }))
  function openImageEditor() {
    if (!canEditOrgImage) return
    setEditorSource(heroImageSource)
    setShowImageEditor(true)
  }

  function openOrganizationEditor(sectionId = 'organization-page-editor') {
    setAdminView(true)
    window.requestAnimationFrame(() => {
      const section = document.getElementById(sectionId) || organizationEditorRef.current
      section?.scrollIntoView({ block: 'start' })
      section?.focus({ preventScroll: true })
    })
  }

  return (
    <section className="panel portal-org-page">
      {isOrganizerView && <nav className="portal-org-organizer-nav" aria-label={`${org.name} organizer navigation`}>
        <span className="portal-org-organizer-nav-label">Organizer tools</span>
        <a href="#organization-overview">Overview</a>
        <a href="#organization-branding" onClick={event => { event.preventDefault(); openOrganizationEditor('organization-branding') }}>Branding</a>
        <a href="#organization-members">Members</a>
        <a href="#organization-events">Events</a>
        <a href="#organization-support">Support</a>
        <a href="#organization-feedback" onClick={event => { event.preventDefault(); openOrganizationEditor('organization-feedback') }}>Feedback</a>
        <a href="#organization-domain" onClick={event => { event.preventDefault(); openOrganizationEditor('organization-domain') }}>Domain</a>
        <a href="#organization-page-editor" onClick={event => { event.preventDefault(); openOrganizationEditor() }}>Settings</a>
      </nav>}
      <div className={`portal-org-layout${org.claimed_by_user_id ? '' : ' portal-org-layout-single'}`}>
        <div className="portal-org-main-column">
          <div id="organization-overview" className="portal-org-hero portal-org-nav-target" tabIndex={-1}>
            <div className="portal-org-hero-copy">
              <p className="tenant-home-eyebrow">{isOrganizerView ? 'Organization dashboard' : `${organizationView[0].toUpperCase()}${organizationView.slice(1)} view`}</p>
              <div className="portal-org-hero-header">
                <h1>{org.name}</h1>
                {canEditOrgImage ? (
                  <span className="portal-org-image-hint">Click image to change</span>
                ) : null}
              </div>
              {org.description ? <p>{org.description}</p> : null}
              <div className="portal-org-actions" aria-label={`${org.name} actions`}>
                {token ? (
                  <Link className="btn-secondary" to={`/chat?start=group&org=${encodeURIComponent(org.slug)}`}>
                    Message Group
                  </Link>
                ) : (
                  <a className="btn-secondary" href={pidpAppLoginUrl(`/orgs/${encodeURIComponent(org.slug)}`)}>
                    Log in to join
                  </a>
                )}
                {org.source_url ? (
                  <a className="btn-secondary" href={org.source_url} target="_blank" rel="noreferrer">
                    Website
                  </a>
                ) : null}
                {isOrganizerView ? (
                  <button type="button" className="btn-secondary" onClick={() => openOrganizationEditor()} aria-expanded={adminView}>
                    <Pencil size={17} aria-hidden="true" />
                    Edit page
                  </button>
                ) : null}
              </div>
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
          {eventGroups.map((group) => <div key={group.kind} id={group.kind === 'hosted' ? 'organization-events' : 'organization-related-events'} className="portal-card portal-org-events-card portal-org-nav-target" tabIndex={-1}>
            <div className="portal-org-events-heading">
              <div>
                <p className="tenant-home-eyebrow">{org.name}</p>
                <h2>{group.kind === 'hosted' ? `${org.name} upcoming events` : 'Events from nearby organizations'}</h2>
              </div>
              <Link to="/events">View all events</Link>
            </div>
            {eventsLoading ? (
              <p className="muted" style={{ margin: 0 }}>
                Loading events…
              </p>
            ) : group.events.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                {group.kind === 'hosted' ? `No upcoming events hosted by ${org.name} are listed.` : 'No upcoming related events are listed.'}
              </p>
            ) : (
              <div className="portal-org-events-grid">
                {group.events.map((event) => (
                  <article key={event.id} className="portal-org-event-card">
                    {event.image_url ? (
                      <img
                        src={event.image_url}
                        alt={event.title}

                      />
                    ) : null}
                    <Link to={`/events/${event.slug}`}>
                      {event.title}
                    </Link>
                    <span className="muted">{formatDate(event.starts_at)}{event.location ? ` • ${event.location}` : ''}</span>
                    {(event.media || []).length ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(86px, 1fr))', gap: '0.45rem', marginTop: '0.35rem' }}>
                        {(event.media || []).map((item) => (
                          <figure key={item.id} style={{ margin: 0, display: 'grid', gap: '0.25rem' }}>
                            <img
                              src={item.url}
                              alt={item.alt || item.label}
                              style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
                            />
                            <figcaption className="muted" style={{ fontSize: '0.78rem' }}>{item.label}</figcaption>
                            {adminView && canManageCurrentOrg ? (
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={eventMediaPending[event.id]}
                                onClick={() => void saveEventMediaList(event, (event.media || []).filter((candidate) => candidate.id !== item.id))}
                              >
                                Remove
                              </button>
                            ) : null}
                          </figure>
                        ))}
                      </div>
                    ) : null}
                    {adminView && canManageCurrentOrg ? (
                      <div style={{ display: 'grid', gap: '0.45rem', marginTop: '0.45rem', paddingTop: '0.45rem', borderTop: '1px solid var(--border)' }}>
                        <label className="muted" htmlFor={`event-media-upload-${event.id}`}>Upload event image</label>
                        <input
                          id={`event-media-upload-${event.id}`}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          disabled={eventMediaPending[event.id]}
                          onChange={(e) => {
                            const file = e.currentTarget.files?.[0] || null
                            void uploadEventMediaFile(event, file)
                            e.currentTarget.value = ''
                          }}
                        />
                        <label className="muted" htmlFor={`event-media-url-${event.id}`}>Or attach hosted image URL</label>
                        <input
                          id={`event-media-url-${event.id}`}
                          value={eventMediaUrlDrafts[event.id] || ''}
                          onChange={(e) => setEventMediaUrlDrafts((prev) => ({ ...prev, [event.id]: e.target.value }))}
                          placeholder="https://example.com/menu.jpg"
                        />
                        <input
                          value={eventMediaLabelDrafts[event.id] || ''}
                          onChange={(e) => setEventMediaLabelDrafts((prev) => ({ ...prev, [event.id]: e.target.value }))}
                          placeholder="Menu label"
                        />
                        <button type="button" disabled={eventMediaPending[event.id]} onClick={() => void addEventMediaUrl(event)}>
                          {eventMediaPending[event.id] ? 'Saving…' : 'Attach Image URL'}
                        </button>
                        {eventMediaStatus[event.id] ? <p className="muted" role="status" style={{ margin: 0 }}>{eventMediaStatus[event.id]}</p> : null}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>)}


          {(organizationView === 'members' || isOrganizerView) && <OrganizationTools />}
          {isOrganizerView && <>
          <OrganizationPortalSections
            name={org.name}
            features={portalConfig?.features ?? (getDomainTenant()?.home_org_slug === org.slug ? getDomainTenant()?.features : undefined) ?? ['directory', 'events', 'chat']}
          />
          {getDomainTenant()?.home_org_slug === org.slug
            ? <OrganizationBrandGuide />
            : portalConfig?.slug_url
              ? <OrganizationBrandGuide href={`${portalConfig.slug_url.replace(/\/$/, '')}/branding`} />
              : null}
          </>}
          {organizationView !== 'organizers' && organizationView !== 'public' && <section className="portal-card" aria-label={`${organizationView} workspace`} style={{ display: 'grid', gap: '.6rem' }}>
            <h2>{organizationView === 'members' ? 'Member workspace' : organizationView === 'volunteers' ? 'Volunteer workspace' : 'Attendee workspace'}</h2>
            <p>{organizationView === 'members' ? 'Members actively participate in a team and can propose and discuss governance changes.' : organizationView === 'volunteers' ? 'Volunteers have helped with a group activity within the previous three months.' : 'Attendees have attended a group activity within the previous three months.'}</p>
            <div className="portal-org-actions">
              <Link className="btn-secondary" to="/org-events">Events and registration</Link>
              {organizationView === 'members' && <Link className="btn-secondary" to="/chat">Messages</Link>}
            </div>
          </section>}
          {mergedFrom ? (
            <p className="muted" role="status" style={{ margin: 0 }}>
              Redirected from merged organization <code>{mergedFrom}</code>.
            </p>
          ) : null}
          <div className="portal-card portal-org-stats-card" style={{ display: 'grid', gap: '0.8rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem' }}>
              <div>
                <strong>{org.upcoming_events_count}</strong>
                <p className="muted" style={{ margin: 0 }}>Upcoming events</p>
              </div>
              {token || canManageCurrentOrg ? (
                <div>
                  <strong>{org.feedback_count || 0}</strong>
                  <p className="muted" style={{ margin: 0 }}>Feedback notes</p>
                </div>
              ) : null}
            </div>
            {token ? (
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
                <Link className="btn-secondary" to={`/chat?start=group&org=${encodeURIComponent(org.slug)}`} style={{ textDecoration: 'none', width: 'fit-content' }}>
                  Message Group
                </Link>
              </div>
            ) : null}
            {membershipStatus ? <p className="muted" role="status" style={{ margin: 0 }}>{membershipStatus}</p> : null}
          </div>
          <div id="organization-members" className="portal-org-nav-target" tabIndex={-1}>
          <OrganizationMembers
            key={org.id}
            organizationId={org.id}
            name={org.name}
            canRead={Boolean(token && (canManageCurrentOrg || membership?.status === 'active'))}
            canManage={canManageCurrentOrg}
            membershipCount={org.membership_count || 0}
          />
          </div>

          {token ? (
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
          ) : null}
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
          {token || canManageCurrentOrg ? (
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
          ) : null}

          {token && !canManageCurrentOrg ? (
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={claimOrganizationBySlug} disabled={claiming || !token}>
                {claiming ? 'Submitting…' : claimActionLabel}
              </button>
            </div>
          ) : canManageCurrentOrg ? (
            <p className="muted" style={{ margin: 0 }}>
              You already administer this organization.
            </p>
          ) : !hasExistingAdmins ? (
            <div>
              <a className="btn-secondary" href={pidpAppLoginUrl(`/orgs/${encodeURIComponent(org.slug)}`)}>
                Sign in to claim this organization
              </a>
              <p className="muted">Claim this organization to become its organizer and manage its profile, members, and events.</p>
            </div>
          ) : null}
          {claimStatus ? (
            <p className="muted" role="status" style={{ margin: 0 }}>
              {claimStatus}
            </p>
          ) : null}
          {token && hasExistingAdmins && !canManageCurrentOrg ? (
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

          <PeerOrganizations organizationId={org.id} tags={org.tags} />

          <div id="organization-support" className="portal-org-nav-target" tabIndex={-1}>
            <OrganizationSupport organizationId={org.id} slug={org.slug} canManage={canManageCurrentOrg} />
          </div>

          {isOrganizerView && adminView ? (
            <div
              ref={organizationEditorRef}
              id="organization-page-editor"
              className="portal-card portal-org-admin-card"
              style={{ display: 'grid', gap: '0.7rem' }}
              tabIndex={-1}
              aria-label={`Edit ${org.name}`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '1rem' }}>Edit organization page</h2>
                <button type="button" className="btn-secondary" onClick={() => setAdminView(false)}>
                  <X size={17} aria-hidden="true" />
                  Close editor
                </button>
              </div>
              <>
                  <p className="muted" style={{ margin: 0 }}>
                    You are an admin of this organization.
                  </p>
                  {myAdminOrgsStatus ? (
                    <p className="muted" style={{ margin: 0 }}>
                      {myAdminOrgsStatus}
                    </p>
                  ) : null}
                  <div id="organization-branding" tabIndex={-1} className="portal-card portal-org-portal-setup portal-org-nav-target" style={{ display: 'grid', gap: '0.65rem', boxShadow: 'none' }}>
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
                          <option value="main">Main domain homepage</option>
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
                    <div id="organization-domain" tabIndex={-1} className="portal-org-domain-flow portal-org-nav-target">
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
                    {portalStatus ? <p className="muted" role="status" style={{ margin: 0 }}>{portalStatus}</p> : null}
                  </div>
                  <div id="organization-feedback" tabIndex={-1} className="portal-card portal-org-nav-target" style={{ display: 'grid', gap: '0.55rem', boxShadow: 'none' }}>
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
                    <input
                      id="org-name"
                      value={orgNameDraft}
                      onChange={(e) => setOrgNameDraft(e.target.value)}
                      placeholder="Organization name"
                    />
                    <label htmlFor="org-description" className="muted">
                      Public description
                    </label>
                    <textarea
                      id="org-description"
                      value={orgDescriptionDraft}
                      onChange={(e) => setOrgDescriptionDraft(e.target.value)}
                      placeholder="Describe this organization"
                      rows={4}
                    />
                    <label htmlFor="org-image-url" className="muted">
                      Organization image URL
                    </label>
                    <input
                      id="org-image-url"
                      value={orgImageDraft}
                      onChange={(e) => setOrgImageDraft(e.target.value)}
                      placeholder="https://example.com/org-image.png"
                    />
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
                    <div className="portal-org-save-bar">
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => void saveOrganizationSettings()}
                        disabled={savingPortal || savingOrgName || savingOrgImage || !orgNameDraft.trim()}
                      >
                        {(savingPortal || savingOrgName || savingOrgImage) ? 'Saving…' : 'Save organization settings'}
                      </button>
                    </div>
                    {mergeStatus ? (
                      <p className="muted" role="status" style={{ margin: 0 }}>
                        {mergeStatus}
                      </p>
                    ) : null}
                  </div>
              </>
            </div>
          ) : null}

        </div>
        {org.claimed_by_user_id && <aside className="portal-org-chat-column">
          {isOrganizerView ? <EmbeddedOrganizationChat id={org.id} slug={org.slug} name={org.name} /> : <div className="portal-card" style={{ display: 'grid', gap: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>{org.name} Chat</h2>
            <p className="muted" style={{ margin: 0 }}>Connect with {org.name} members in our shared chat room.</p>
            {token ? (
              membership?.status === 'active' ? (
                <Link className="btn-primary" to={`/chat?start=org&org=${encodeURIComponent(org.slug)}`}>
                  Open {org.name} Chat
                </Link>
              ) : <p className="muted" style={{ margin: 0 }}>Join {org.name} above to take part in the chat.</p>
            ) : (
              <a className="btn-primary" href={pidpAppLoginUrl(`/orgs/${encodeURIComponent(org.slug)}`)}>
                Sign in to join {org.name} Chat
              </a>
            )}
          </div>}
        </aside>}
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
