import {useAutosave} from '../../hooks/useAutosave'
import {AutosaveStatus} from '../../components/AutosaveStatus'
import {OrganizationCandidateStar} from '../../components/OrganizationCandidateStar'
import './organization-profile.css'
import { organizationPageTabs, resolveOrganizationPageTab, type OrganizationPageTab } from './organizationPageTabs'
import { organizationPageTheme } from '../../../config/organizationThemes'
import { NeoNatalFocus } from '../../components/NeoNatalFocus'
import { EventPosterTools } from '../../components/EventPosterTools'
import { OrganizationBoard } from '../../components/OrganizationBoard'
import {isRetiredOrganizationHref} from '../../../../../shared/organizationUrls'
import { OrganizationPageStatistics } from '../../components/OrganizationPageStatistics'
import { useOrganizationPageView } from '../../hooks/useOrganizationPageView'
import { invalidatePublicOrganizationData } from '../../../data/publicOrganization/cache'
import { loadPublicOrganization } from '../../../data/publicOrganization/organizations'
import { loadHostedOrganizationEvents } from '../../../data/publicOrganization/hostedEvents'
import { BioMarkdown } from '../../components/profile/BioMarkdown'
import { OrganizationLinksEditor } from '../../components/OrganizationLinksEditor'
import { normalizeOrganizationLinks, organizationLinkLabels, type OrganizationLink } from '../../../../../shared/organizationLinks'
import { OrganizationFollowButton } from '../../components/OrganizationFollowButton'
import { GroupMailingList, GroupEmailPreference } from '../email/GroupMailingList'
import { groupOrganizationEvents } from './organizationEvents'
import { EmbeddedOrganizationChat } from '../../components/EmbeddedOrganizationChat'
import { OrganizationBranding } from '../../components/OrganizationBranding'
import { getGroupSite,parseGroupSite,type GroupSite } from '../../../config/timebankCommunity'
import { specialtyResourcesForTenant } from '../../../config/specialtyResources'
import { SpecialtyResourcesPanel } from '../../components/SpecialtyResourcesPanel'
import { OrganizationSupport } from '../../components/OrganizationSupport'
import { OrganizationTools } from '../../components/OrganizationTools'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import X from 'lucide-react/dist/esm/icons/x.mjs'
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
  links?: OrganizationLink[]
  image_url?: string | null
  tags?: string[]
  candidates?: {event_id:string;event_slug:string;event_title:string;submission_id:string;title:string;stars:number}[]
  upcoming_events_count: number
  membership_count?: number
  feedback_count?: number
  feedback_positive_count?: number
  feedback_concern_count?: number
  feedback_score?: number
  claimed_by_user_id?: string | null
  pending_challenges_count: number
  is_disputed: boolean
  group_home_url?: string | null
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

export function PublicAdminPage({ dashboard = false }: { dashboard?: boolean }) {
  const navigate = useNavigate()
  const { token } = useAuth()
  const { handle } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  function selectTab(tab: OrganizationPageTab) {
    setSearchParams(previous => { const next = new URLSearchParams(previous); if (tab === 'about') next.delete('tab'); else next.set('tab', tab); return next })
  }
  const [org, setOrg] = useState<PublicOrganization | null>(null)
  useOrganizationPageView(org&&org.slug===handle?org.slug:null,dashboard)
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError,setEventsError]=useState('')
  const [status, setStatus] = useState<string>('Loading organization…')
  const [supportOpen, setSupportOpen] = useState(false)
  const [claimStatus, setClaimStatus] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [claimRecorded, setClaimRecorded] = useState(false)
  const [feedbackRating, setFeedbackRating] = useState<FeedbackRating>('neutral')
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null)
  const [feedbackReviews, setFeedbackReviews] = useState<OrganizationFeedbackReview[]>([])
  const [feedbackReviewStatus, setFeedbackReviewStatus] = useState<string | null>(null)
  const [membership, setMembership] = useState<OrganizationMembership | null>(null)
  const [membershipStatus, setMembershipStatus] = useState<string | null>(null)
  const [orgSettingsReady,setOrgSettingsReady]=useState('')
  const [portalConfig, setPortalConfig] = useState<OrganizationPortal | null>(null)
  const [publicPortal,setPublicPortal]=useState<{organizationId:string;site:GroupSite|null;error:string}|null>(null)
  const [publicPortalRevision,setPublicPortalRevision]=useState(0)
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
  const [savingPortalDomain, setSavingPortalDomain] = useState(false)
  const [myAdminOrgs, setMyAdminOrgs] = useState<MyOrganization[]>([])
  const [permissionToken, setPermissionToken] = useState<string | null>(null)
  const [operatorToken, setOperatorToken] = useState<string | null>(null)
  const [myAdminOrgsStatus, setMyAdminOrgsStatus] = useState<string | null>(null)
  const [mergeSourceOrgId, setMergeSourceOrgId] = useState('')
  const [mergeStatus, setMergeStatus] = useState<string | null>(null)
  const [merging, setMerging] = useState(false)
  const [orgNameDraft, setOrgNameDraft] = useState('')
  const [orgDescriptionDraft, setOrgDescriptionDraft] = useState('')
  const [orgImageDraft, setOrgImageDraft] = useState('')
  const [orgLinksDraft, setOrgLinksDraft] = useState<OrganizationLink[]>([])
  const [savingOrgImage, setSavingOrgImage] = useState(false)
  const organizationEditorRef = useRef<HTMLDivElement | null>(null)
  const [showImageEditor, setShowImageEditor] = useState(false)
  const [editorSource, setEditorSource] = useState<string | null>(null)
  const hasManagementAccess = Boolean(token && (operatorToken === token || (permissionToken === token && myAdminOrgs.some((item) => item.id === org?.id))))
  const canManageCurrentOrg = dashboard && hasManagementAccess
  const organizationDraft={name:orgNameDraft,description:orgDescriptionDraft,image_url:orgImageDraft,links:orgLinksDraft,slug:portalSlugDraft,portalName:portalNameDraft,tagline:portalTaglineDraft,home_kind:portalHomeKindDraft,home_heading:portalHeadingDraft,home_description:portalDescriptionDraft,home_image_url:portalImageDraft}
  const organizationAutosave=useAutosave({value:organizationDraft,scope:`organization:${org?.id}:${token}`,enabled:Boolean(org?.id&&orgSettingsReady===org.id&&canManageCurrentOrg),save:saveOrganizationSettings})

  const orgTabs = organizationPageTabs(canManageCurrentOrg)
  const activeTab = resolveOrganizationPageTab(searchParams.get('tab'), canManageCurrentOrg)
  const isWorkspaceView = Boolean(dashboard && token && (hasManagementAccess || membership?.status === 'active'))
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
    let cancelled = false
    setStatus('Loading organization…')
    loadPublicOrganization<PublicOrganization>(handle)
      .then((orgData) => {
        if (cancelled) return
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
        setOrgLinksDraft(orgData.links || [])
        setPortalSlugDraft(normalizePortalSlug(orgData.slug || orgData.name || ''))
        setPortalNameDraft(orgData.name || '')
        setPortalTaglineDraft(orgData.description || '')
        setPortalHomeKindDraft('landing')
        setPortalHeadingDraft(orgData.name || '')
        setPortalDescriptionDraft(orgData.description || '')
        setPortalImageDraft(orgData.image_url || '')
        setEvents([])
        setStatus('')
      })
      .catch((err) => {
        if (cancelled) return
        setOrg(null)
        setEvents([])
        setStatus(toUserFacingErrorMessage(err, 'Organization unavailable'))
      })
    return () => { cancelled = true }
  }, [handle, navigate])

  useEffect(() => {
    if (!org?.slug || activeTab !== 'events') return
    let cancelled = false
    const controller = new AbortController()
    setEventsLoading(true)
    setEventsError('')
    loadHostedOrganizationEvents<PublicEvent>(org.slug, controller.signal)
      .then(rows => { if (!cancelled) setEvents(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (!cancelled) { setEvents([]); setEventsError('Upcoming events are temporarily unavailable.') } })
      .finally(() => { if (!cancelled) setEventsLoading(false) })
    return () => { cancelled = true; controller.abort() }
  }, [org?.slug, activeTab])

  useEffect(()=>{
    if(!org?.id||!org.slug)return
    const controller=new AbortController(),organizationId=org.id
    void fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(org.slug)}/branding`),{signal:controller.signal,cache:'no-store'}).then(async response=>{
      if(!response.ok)throw new Error('Organization homepage details are temporarily unavailable.')
      const data=await response.json(),site=data.portal?parseGroupSite(data.portal):null
      if(data.portal&&!site)throw new Error('Organization homepage details are temporarily unavailable.')
      if(!controller.signal.aborted)setPublicPortal({organizationId,site,error:''})
    }).catch(error=>{if(!controller.signal.aborted)setPublicPortal({organizationId,site:null,error:error.message})})
    return()=>controller.abort()
  },[org?.id,org?.slug,publicPortalRevision])

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
    const controller = new AbortController()
    setPermissionToken(null)
    setOperatorToken(null)
    setMyAdminOrgs([])
    if (!token) {
      setMyAdminOrgs([])
      setMyAdminOrgsStatus('Sign in to access organization admin controls.')
      return
    }
    fetch(orgUrl('/admin/me'), { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted && data?.is_sysadmin === true) setOperatorToken(token) })
      .catch(() => {})
    setMyAdminOrgsStatus('Loading admin organizations…')
    fetch(orgUrl('/api/network/orgs?mine=true&limit=300'), {
      signal: controller.signal,
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
        if (controller.signal.aborted) return
        setPermissionToken(token)
        const admins = (Array.isArray(rows) ? rows : []).filter((row) => row.my_role === 'owner' || row.my_role === 'administrator')
        setMyAdminOrgs(admins)
        setMyAdminOrgsStatus('')
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setMyAdminOrgs([])
        setMyAdminOrgsStatus(toUserFacingErrorMessage(err, 'Failed to load admin organizations'))
      })
    return () => controller.abort()
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
    setOrgSettingsReady('')
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
          setPortalTaglineDraft(portal.tagline ?? '')
          setPortalHomeKindDraft(portal.home_kind || 'landing')
          setPortalHeadingDraft(portal.home_heading || portal.name || org.name)
          setPortalDescriptionDraft(portal.home_description || portal.tagline || org.description || '')
          setPortalImageDraft(portal.home_image_url || org.image_url || '')
          setPortalDomainDraft(portal.custom_domain_hostname || '')
          setPortalDomainNotesDraft(portal.custom_domain_notes || '')
        }
        setPortalStatus('')
        setOrgSettingsReady(org.id)
      })
      .catch((err) => {
        if (cancelled) return
        setPortalStatus(toUserFacingErrorMessage(err, 'Failed to load portal setup'))
      })
    return () => {
      cancelled = true
    }
  }, [canManageCurrentOrg, org?.id, org?.slug, token])

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

  useEffect(() => { setClaimStatus(''); setClaimRecorded(false) }, [org?.id, token])

  async function submitClaim() {
    if (!org || !token || claiming || claimRecorded) return
    setClaiming(true); setClaimStatus('')
    try {
      const response = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/claim`), {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || result.error || 'Could not record your claim.')
      setClaimRecorded(true)
      setClaimStatus(result.status === 'owner' ? 'Claim recorded. You are now the owner.' : 'Claim recorded. An admin can select the owner from the claimants.')
      await invalidatePublicOrganizationData()
      window.dispatchEvent(new Event('organization-access-change'))
    } catch (error) { setClaimStatus(toUserFacingErrorMessage(error, 'Could not record your claim.')) }
    finally { setClaiming(false) }
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

  async function saveOrganizationSettings(next:typeof organizationDraft,previous:typeof organizationDraft) {
    if(!org||!token||!hasManagementAccess)throw new Error('Sign in as an organization manager to save changes.')
    const changed=(key:keyof typeof next)=>JSON.stringify(next[key])!==JSON.stringify(previous[key])
    const name=next.name.trim()
    if(!name)throw new Error('Organization name is required.')
    const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'}
    const profileChanged=(['name','description','image_url','links'] as const).some(changed)
    if(profileChanged){
      const body=Object.fromEntries((['name','description','image_url','links'] as const).filter(changed).map(key=>[key,key==='name'?name:key==='links'?normalizeOrganizationLinks(next.links):key==='image_url'?next.image_url.trim()||null:next.description.trim()]))
      const response=await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}`),{method:'PATCH',headers,body:JSON.stringify(body)})
      if(!response.ok)throw new Error('Could not save organization changes. Please retry.')
      const updated=await response.json()
      setOrg(current=>current?.id===org.id?{...current,...updated}:current)
      setMyAdminOrgs(current=>current.map(item=>item.id===org.id?{...item,...updated}:item))
    }
    const portalChanged=(['slug','portalName','tagline','home_kind','home_heading','home_description','home_image_url'] as const).some(changed)
    if(portalChanged){
      const slug=normalizePortalSlug(next.slug||org.slug)
      if(slug.length<3)throw new Error('Use a portal slug with at least 3 characters.')
      const base=orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/portal`)
      const current=await fetch(base,{headers});if(!current.ok)throw new Error('Could not load current portal settings. Please retry.')
      const existing=(await current.json()).portal
      const response=await fetch(base,{method:'PUT',headers,body:JSON.stringify({...existing,slug,name:next.portalName||name,tagline:next.tagline,home_kind:next.home_kind||'main',home_heading:next.home_heading||next.portalName||name,home_description:next.home_description,home_image_url:next.home_image_url||null,features:existing?.features||['directory','events','chat']})})
      if(!response.ok)throw new Error('Could not save portal settings. Please retry.')
      const saved=await response.json();setPortalConfig(saved.portal);setPublicPortalRevision(value=>value+1)
    }
    await invalidatePublicOrganizationData()
  }

  async function updatePortalCustomDomain() {
    if (!org || !token) return
    const hostname = normalizeDomain(portalDomainDraft)
    if (!hostname) {
      setPortalStatus('Enter the custom domain first.')
      return
    }
    setSavingPortalDomain(true)
    setPortalStatus(null)
    try {
      const resp = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/portal/custom-domain/request`), {
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
      setPortalStatus('Custom domain request saved. An operator will verify DNS, HTTPS, and single sign-on before activation.')
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
    if (!org || !token || !canManageCurrentOrg) return
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
      setMergeStatus('Image uploaded. Changes save automatically.')
      setShowImageEditor(false)
      setEditorSource(null)
      openOrganizationEditor('org-image-url')
    } catch (err) {
      setMergeStatus(toUserFacingErrorMessage(err, 'Image upload failed'))
    } finally {
      setSavingOrgImage(false)
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
  const canEditOrgImage = canManageCurrentOrg
  const tenant = getGroupSite()
  const site=publicPortal?.organizationId===org.id?publicPortal.site:null
  const pageTheme=organizationPageTheme(site)
  const organizationBrandImage = site?.brand_image_path||(tenant?.organization_id === org.id ? tenant.brand_image_path : null)
  const ownImage=org.image_url?.trim()
  const heroImageSource = ownImage&&ownImage!==ORG_PLACEHOLDER_SRC?ownImage:organizationBrandImage||ORG_PLACEHOLDER_SRC
  const eventGroups = groupOrganizationEvents(events, org).filter(group => group.kind==='hosted')
  const resources=specialtyResourcesForTenant(site)
  const portalDescription=site?.home_description?.trim()
  const isNeoNatalProfile = org.id === '20df0f86-111f-4cb1-bb3d-8dff604dded6' && !dashboard
  const coverImage = site?.home_image_url || (isNeoNatalProfile ? ownImage : null)
  const portalAction=(label:string|null|undefined,value:string|null|undefined)=>{
    if(!label||!value)return null
    if(value==='/users/login')return <a className="btn-secondary" href={pidpAppLoginUrl(`/orgs/${encodeURIComponent(org.slug)}`)}>{label}</a>
    if(value==='/org-events')return <button type="button" className="btn-secondary" onClick={()=>selectTab('events')}>{label}</button>
    try{const url=new URL(value,window.location.origin);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null
      return url.origin===window.location.origin?<Link className="btn-secondary" to={url.pathname+url.search+url.hash}>{label}</Link>:<a className="btn-secondary" href={url.href} target="_blank" rel="noopener noreferrer">{label}</a>
    }catch{return null}
  }
  function openImageEditor() {
    if (!canEditOrgImage) return
    setEditorSource(heroImageSource)
    setShowImageEditor(true)
  }

  function openOrganizationEditor(sectionId = 'organization-page-editor') {
    if (!canManageCurrentOrg) return
    selectTab('settings')
    window.requestAnimationFrame(() => {
      const section = document.getElementById(sectionId) || organizationEditorRef.current
      section?.scrollIntoView({ block: 'start' })
      section?.focus({ preventScroll: true })
    })
  }

  return (
    <section className={`portal-org-page organization-profile${isNeoNatalProfile ? ' neonatal-page' : ''}`} data-brand-theme={pageTheme?'configured':undefined}>
      {pageTheme && <style>{pageTheme}</style>}
      <header className="organization-profile-header" id="organization-overview">
        <button type="button" className={`organization-profile-avatar${canEditOrgImage ? ' editable' : ''}`} onClick={openImageEditor} disabled={!canEditOrgImage} aria-label={canEditOrgImage ? 'Change organization image' : 'Organization image'}>
          <OrgImage src={heroImageSource} fallbackSrc={organizationBrandImage} alt={org.name}/>
        </button>
        <div className="organization-profile-identity">
          {dashboard && <p className="tenant-home-eyebrow">Organization workspace</p>}
          <h1>{site?.home_heading || org.name}</h1>
          {site?.tagline && site.tagline !== org.description && <p className="organization-profile-tagline">{site.tagline}</p>}
        </div>
        <div className="organization-profile-actions">
          {Boolean(org.links?.length) && org.links!.filter(link=>!isRetiredOrganizationHref(link.url)).map(link=><a key={link.id} className={link.type === 'website' ? 'btn-primary' : 'btn-secondary'} href={link.url} target="_blank" rel="noopener noreferrer">{link.label || organizationLinkLabels[link.type]}</a>)}
          {org.source_url && !isRetiredOrganizationHref(org.source_url) && !org.links?.some(link=>link.url===org.source_url) && <a className="btn-primary" href={org.source_url} target="_blank" rel="noreferrer">Website</a>}
          {token && <OrganizationFollowButton orgId={org.id} slug={org.slug}/>}
          {dashboard && <Link className="btn-secondary" to={`/orgs/${encodeURIComponent(org.slug)}`}>Public profile</Link>}
        </div>
      </header>
      {Boolean(org.candidates?.length) && <ul className="organization-candidates" aria-label="Event candidacies">{org.candidates!.map(candidate=><li key={`${candidate.event_id}:${candidate.submission_id}`}>
        <Link className="organization-candidate-event" to={`/events/${encodeURIComponent(candidate.event_slug)}?tab=submissions#submissions`}><span className="organization-candidate-label">Candidate</span><strong>{candidate.event_title}</strong>{org.candidates!.filter(item=>item.event_id===candidate.event_id).length>1&&<span>{candidate.title}</span>}</Link>
        <OrganizationCandidateStar key={`${candidate.event_id}:${candidate.submission_id}`} eventId={candidate.event_id} submissionId={candidate.submission_id} title={candidate.title} stars={candidate.stars}/>
      </li>)}</ul>}
      <div className="portal-org-info-tabs organization-profile-tabs" role="tablist" aria-label={`${org.name} information`}>
        {orgTabs.map((tab,index) => <button type="button" role="tab" id={`org-tab-${tab.id}`} aria-controls={`org-panel-${tab.id}`} aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} key={tab.id} onClick={() => selectTab(tab.id)} onKeyDown={event => {
          if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return
          event.preventDefault()
          const next=event.key==='Home'?orgTabs[0]:event.key==='End'?orgTabs[orgTabs.length-1]:orgTabs[(index+(event.key==='ArrowRight'?1:orgTabs.length-1))%orgTabs.length]
          selectTab(next.id); document.getElementById(`org-tab-${next.id}`)?.focus()
        }}>{tab.label}</button>)}
      </div>
      <div className="organization-profile-panel" role="tabpanel" id="org-panel-about" aria-labelledby="org-tab-about" hidden={activeTab !== 'about'}>
        <div className={`organization-about${coverImage ? ' organization-about-with-cover' : ''}`}>
          {coverImage && <figure className="organization-profile-cover"><OrgImage src={coverImage} alt={`${org.name} cover`}/></figure>}
          <section className="organization-about-copy">
            <h2>About {site?.name || org.name}</h2>
            {isNeoNatalProfile ? <><p className="neonatal-tagline">Engineering insight into complex disease.</p><p>A Baltimore team of data engineers working to better understand poorly understood diseases.</p></> : <>
              {org.description && <BioMarkdown value={org.description}/>}
              {portalDescription && portalDescription !== org.description?.trim() && portalDescription !== site?.tagline?.trim() && <BioMarkdown value={portalDescription}/>}
            </>}
            {Boolean(org.tags?.length) && <ul className="organization-profile-tags" aria-label="Organization tags">{org.tags!.map(tag=><li className="pill" key={tag}>{tag}</li>)}</ul>}
            {org.slug==='code-collective' && <Link className="btn-secondary" to="/orgs/code-collective/five-over-five">★ Five over Five · Nominate and vote</Link>}
            {site?.home_primary_href && !['/users/login','/org-events'].includes(site.home_primary_href) && portalAction(site.home_primary_label,site.home_primary_href)}
            {site?.home_secondary_href && !['/users/login','/org-events'].includes(site.home_secondary_href) && portalAction(site.home_secondary_label,site.home_secondary_href)}
            {mergedFrom && <p className="muted" role="status">Redirected from merged organization <code>{mergedFrom}</code>.</p>}
            {publicPortal?.organizationId===org.id && publicPortal.error && <p role="status">{publicPortal.error}</p>}
          </section>
        </div>
        {isNeoNatalProfile && <><NeoNatalFocus/>{(org.description || portalDescription) && <details className="neonatal-about"><summary>About NeoNatal AI</summary>{org.description && <BioMarkdown value={org.description}/>}</details>}</>}
        {resources.length>0 && <SpecialtyResourcesPanel resources={resources}/>}
      </div>
      <div className="organization-profile-panel" role="tabpanel" id="org-panel-events" aria-labelledby="org-tab-events" hidden={activeTab !== 'events'}>
        {activeTab==='events' && <>          {eventGroups.map((group) => <div key={group.kind} id={group.kind === 'hosted' ? 'organization-events' : 'organization-related-events'} className="organization-event-section portal-org-nav-target" tabIndex={-1}>
            <div className="portal-org-events-heading">
              <div>
                <p className="tenant-home-eyebrow">{org.name}</p>
                <h2>{group.kind === 'hosted' ? 'Upcoming events' : 'Events from nearby organizations'}</h2>
              </div>
              <Link to="/events">View all events</Link>
              {canManageCurrentOrg && group.kind === 'hosted' && <Link className="btn-secondary" to="/orgs/events">Manage events</Link>}
            </div>
            {eventsLoading ? (
              <p className="muted" style={{ margin: 0 }}>
                Loading events…
              </p>
            ) : eventsError ? <p role="status" className="muted">{eventsError}</p> : group.events.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                {group.kind === 'hosted' ? `No upcoming events hosted by ${org.name} are listed.` : 'No upcoming related events are listed.'}
              </p>
            ) : (
              <div className="portal-org-events-grid">
                {group.events.map((event) => (
                  <Link key={event.id} className="portal-org-event-card" to={`/events/${encodeURIComponent(event.slug)}`}>
                    <OrgImage
                      src={event.image_url || event.media?.[0]?.url || coverImage || heroImageSource}
                      fallbackSrc={organizationBrandImage}
                      alt=""
                      className={!event.image_url && !event.media?.length ? 'portal-org-event-brand-image' : undefined}
                    />
                    <strong className="portal-org-event-title">{event.title}</strong>
                    <span className="muted">{event.starts_at ? new Date(event.starts_at).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Date to be announced'}</span>
                    {event.location ? <span className="muted portal-org-event-location">{event.location}</span> : null}
                  </Link>
                ))}
              </div>
            )}
          </div>)}</>}
      </div>
      <div className="organization-profile-panel" role="tabpanel" id="org-panel-personnel" aria-labelledby="org-tab-personnel" hidden={activeTab !== 'personnel'}>
        {activeTab==='personnel' && <OrganizationBoard embedded organization={org} canManage={canManageCurrentOrg} canRead={Boolean(token&&(canManageCurrentOrg||membership?.status==='active'))} memberType={org.tags?.includes('Team')?'team':'community'}/>}
      </div>
      <div className="organization-profile-panel" role="tabpanel" id="org-panel-community" aria-labelledby="org-tab-community" hidden={activeTab !== 'community'}>
        {activeTab==='community' && <div className="organization-community">
          <section className="organization-community-section">
            <h2>Community</h2>
            {membership?.status==='active' ? <p className="muted">{membership.role==='member'?'You are a member of this organization.':'You manage this organization.'}</p> : token ? <button type="button" className="btn-primary" onClick={()=>void updateOrganizationMembership(true)}>Join Group</button> : <a className="btn-primary" href={pidpAppLoginUrl(`/orgs/${encodeURIComponent(org.slug)}?tab=community`)}>Sign in to participate</a>}
            {membership?.status==='active' && membership.role==='member' && <button type="button" className="btn-secondary" onClick={()=>void updateOrganizationMembership(false)}>Leave Group</button>}
            {membershipStatus && <p role="status">{membershipStatus}</p>}
            {org.claimed_by_user_id && (isWorkspaceView ? <EmbeddedOrganizationChat id={org.id} slug={org.slug} name={org.name}/> : token && membership?.status==='active' ? <Link className="btn-secondary" to={`/chat?start=org&org=${encodeURIComponent(org.slug)}`}>Open group conversation</Link> : <p className="muted">Members can take part in the group conversation.</p>)}
          </section>
          {token && <GroupEmailPreference organizationId={org.id}/>}
                    {token ? (
            <div id="organization-member-feedback" className="organization-community-section portal-org-nav-target" tabIndex={-1} style={{ display: 'grid', gap: '0.65rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem' }}>Group Feedback</h2>
              {canManageCurrentOrg && <button type="button" className="btn-secondary" onClick={() => openOrganizationEditor('organization-feedback')}>Manage feedback</button>}
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
          {isWorkspaceView && <section className="organization-community-section"><h2>Member tools</h2><OrganizationTools/></section>}
          <details className="organization-community-section" onToggle={event=>setSupportOpen(event.currentTarget.open)}><summary>Support and contributions</summary>{supportOpen && <OrganizationSupport organizationId={org.id} slug={org.slug} canManage={canManageCurrentOrg}/>}</details>
          {!canManageCurrentOrg && membership?.role!=='owner' && <details className="organization-ownership"><summary>Organization ownership</summary>
            {org.is_disputed && <p>{org.pending_challenges_count} pending ownership claim{org.pending_challenges_count===1?'':'s'}.</p>}
            {token ? <button type="button" className="btn-secondary" onClick={()=>void submitClaim()} disabled={claiming||claimRecorded}>{claiming?'Recording…':claimRecorded?'Claim recorded':'Claim this Org'}</button> : <a href={pidpAppLoginUrl(`/orgs/${encodeURIComponent(org.slug)}?tab=community`)}>Claim this Org</a>}
            {claimStatus && <p role="status">{claimStatus}</p>}
          </details>}
        </div>}
      </div>
      <div className="organization-profile-panel" role="tabpanel" id="org-panel-branding" aria-labelledby="org-tab-branding" hidden={activeTab !== 'branding'}>
        {activeTab==='branding' && <OrganizationBranding embedded organization={org} canManage={canManageCurrentOrg} onPreview={(site,avatar)=>{setPublicPortal({organizationId:org.id,site,error:''});setOrg(previous=>previous?.id===org.id?{...previous,image_url:avatar}:previous)}}/>}
      </div>
      <div className="organization-profile-panel" role="tabpanel" id="org-panel-poster" aria-labelledby="org-tab-poster" hidden={activeTab !== 'poster'}>
        {activeTab==='poster' && <EventPosterTools key={org.id} kind="organization" inline slug={org.slug} title={org.name} organizationSlug={org.slug} organizationLinks={org.links} sourceUrl={org.source_url&&!isRetiredOrganizationHref(org.source_url)?org.source_url:null}/>}
      </div>
      {canManageCurrentOrg && <div className="organization-profile-panel" role="tabpanel" id="org-panel-settings" aria-labelledby="org-tab-settings" hidden={activeTab !== 'settings'}>
        {activeTab==='settings' && <>
          <div className="organization-profile-management">{token && <OrganizationPageStatistics key={org.id} organizationId={org.id} token={token}/>}</div>
          <GroupMailingList organizationId={org.id}/>
                    {canManageCurrentOrg && activeTab === 'settings' ? (
            <div
              ref={organizationEditorRef}
              id="organization-page-editor" inert={orgSettingsReady!==org.id}
              className="organization-settings"
              style={{ display: 'grid', gap: '0.7rem' }}
              tabIndex={-1}
              aria-label={`Edit ${org.name}`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '1rem' }}>Edit organization page</h2>
                <button type="button" className="btn-secondary" onClick={() => selectTab('about')}>
                  <X size={17} aria-hidden="true" />
                  Back to About
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
                  <div id="organization-branding" tabIndex={-1} className="portal-org-portal-setup portal-org-nav-target" style={{ display: 'grid', gap: '0.65rem', boxShadow: 'none' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '0.98rem' }}>Homepage and branding</h3>
                      <p className="muted" style={{ margin: '0.2rem 0 0' }}>
                        Configure the content and branding on this organization page. Custom domains use the same accounts, members, and organizer roles.
                      </p>
                    </div>
                    <div className="portal-org-portal-grid">
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
                        Organization URL: <a href={portalConfig.slug_url}>{portalConfig.slug_url}</a>
                      </p>
                    ) : (
                      <p className="muted" style={{ margin: 0 }}>
                        Organization URL: /orgs/{org.slug}
                      </p>
                    )}
                    <div id="organization-domain" tabIndex={-1} className="portal-org-domain-flow portal-org-nav-target">
                      <div>
                        <h4 style={{ margin: 0, fontSize: '0.92rem' }}>Custom domain</h4>
                        <p className="muted" style={{ margin: '0.15rem 0 0' }}>
                          Activation requires verified DNS, HTTPS, and OrgPortal sign-in. Status: {portalConfig?.custom_domain_status || 'none'}
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
                          onClick={() => void updatePortalCustomDomain()}
                          disabled={savingPortalDomain || !portalConfig}
                        >
                          Request Domain
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
                  <div id="organization-feedback" tabIndex={-1} className="organization-settings-section portal-org-nav-target" style={{ display: 'grid', gap: '0.55rem', boxShadow: 'none' }}>
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
                    <OrganizationLinksEditor links={orgLinksDraft} onChange={setOrgLinksDraft}/>
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
                    <div className="portal-org-save-bar"><AutosaveStatus state={organizationAutosave} label="Organization settings" onRetry={organizationAutosave.retry}/></div>
                    {mergeStatus ? (
                      <p className="muted" role="status" style={{ margin: 0 }}>
                        {mergeStatus}
                      </p>
                    ) : null}
                  </div>
              </>
            </div>
          ) : null}
        </>}
      </div>}
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
