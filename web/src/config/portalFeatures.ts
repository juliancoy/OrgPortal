import { getDomainCommunity } from './timebankCommunity'
export type PortalFeature = 'ubi'

export type PortalProfileId = 'code-collective' | 'baltimore-medtech'

export type PortalProfileConfig = {
  id: PortalProfileId
  brandName: string
  portalTitle: string
  tagline: string
  brandImagePath?: string
  homeUrl: string
  memberHomePath: string
  disabledFeatures: PortalFeature[]
}

const PROFILE_STORAGE_KEY = 'portal.profile'
export const MEDTECH_PORTAL_HOST = 'medtech.social'
const PROFILE_QUERY_PARAMS = ['portalProfile', 'profile', 'site']

const PORTAL_PROFILES: Record<PortalProfileId, PortalProfileConfig> = {
  'code-collective': {
    id: 'code-collective',
    brandName: 'Code Collective',
    portalTitle: 'Org Portal',
    tagline: 'Coding a New Economy',
    brandImagePath: '/images/namebanner.png',
    homeUrl: '/',
    memberHomePath: '/chat',
    disabledFeatures: [],
  },
  'baltimore-medtech': {
    id: 'baltimore-medtech',
    brandName: 'Baltimore MedTech',
    portalTitle: 'Baltimore MedTech Portal',
    tagline: 'Health × Medicine × Biotech',
    brandImagePath: '/images/baltimore-medtech-logo-square.jpg',
    homeUrl: 'https://medtech.social/',
    memberHomePath: '/community',
    disabledFeatures: ['ubi'],
  },
}

function normalizeProfileId(value?: string | null): PortalProfileId | null {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return null
  if (['baltimore-medtech', 'bmore-medtech', 'baltimoremedtech', 'medtech'].includes(normalized)) {
    return 'baltimore-medtech'
  }
  if (['code-collective', 'codecollective', 'default', 'main'].includes(normalized)) {
    return 'code-collective'
  }
  return null
}

function storageGet(storage?: Pick<Storage, 'getItem'> | null): PortalProfileId | null {
  if (!storage) return null
  try {
    return normalizeProfileId(storage.getItem(PROFILE_STORAGE_KEY))
  } catch {
    return null
  }
}

function storageSet(profileId: PortalProfileId, storage?: Pick<Storage, 'setItem'> | null) {
  if (!storage) return
  try {
    storage.setItem(PROFILE_STORAGE_KEY, profileId)
  } catch {
    // Storage can be unavailable in private or embedded contexts.
  }
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

// Keep navigation branded when browser storage is unavailable, without sharing
// another tab's selected community.
let browserProfileId: PortalProfileId | null = null

export function readPortalProfileIdFromSearch(search = ''): PortalProfileId | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  for (const key of PROFILE_QUERY_PARAMS) {
    const profileId = normalizeProfileId(params.get(key))
    if (profileId) return profileId
  }
  return null
}

export function getActivePortalProfileConfig(
  search = typeof window === 'undefined' ? '' : window.location.search,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = browserStorage(),
  hostname = typeof window === 'undefined' ? '' : window.location.hostname,
): PortalProfileConfig {
  if (hostname === MEDTECH_PORTAL_HOST) return PORTAL_PROFILES['baltimore-medtech']
  const community = getDomainCommunity()
  if (community) return { id: 'code-collective', brandName: community.name, portalTitle: community.name, tagline: community.tagline, homeUrl: '/', memberHomePath: '/', disabledFeatures: [] }
  const urlProfileId = readPortalProfileIdFromSearch(search)
  const profileId = urlProfileId || (typeof window !== 'undefined' ? browserProfileId : null) || storageGet(storage) || 'code-collective'
  if (urlProfileId) storageSet(urlProfileId, storage)
  if (typeof window !== 'undefined') browserProfileId = profileId
  return PORTAL_PROFILES[profileId]
}

export function isPortalFeatureEnabled(feature: PortalFeature, profile = getActivePortalProfileConfig()): boolean {
  return !profile.disabledFeatures.includes(feature)
}

export function portalProfileLoginSearch(profileId: PortalProfileId): string {
  return `portalProfile=${encodeURIComponent(profileId)}`
}

export function portalProfilePath(path: string, profile = getActivePortalProfileConfig()): string {
  if (profile.id !== 'baltimore-medtech') return path
  const url = new URL(path, 'https://portal.invalid')
  if (url.origin !== 'https://portal.invalid') throw new Error('Expected an internal portal path')
  url.searchParams.set('portalProfile', profile.id)
  return `${url.pathname}${url.search}${url.hash}`
}
