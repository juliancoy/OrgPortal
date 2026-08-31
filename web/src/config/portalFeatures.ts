export type PortalFeature = 'ubi'

export type PortalProfileId = 'code-collective' | 'baltimore-medtech'

export type PortalProfileConfig = {
  id: PortalProfileId
  brandName: string
  portalTitle: string
  tagline: string
  brandImagePath?: string
  disabledFeatures: PortalFeature[]
}

const PROFILE_STORAGE_KEY = 'portal.profile'
const PROFILE_QUERY_PARAMS = ['portalProfile', 'profile', 'site']

const PORTAL_PROFILES: Record<PortalProfileId, PortalProfileConfig> = {
  'code-collective': {
    id: 'code-collective',
    brandName: 'Code Collective',
    portalTitle: 'Org Portal',
    tagline: 'Coding a New Economy',
    brandImagePath: '/images/namebanner.png',
    disabledFeatures: [],
  },
  'baltimore-medtech': {
    id: 'baltimore-medtech',
    brandName: 'Baltimore MedTech',
    portalTitle: 'Baltimore MedTech Portal',
    tagline: 'Medicine, technology, research, and entrepreneurship in Baltimore.',
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
    return window.localStorage
  } catch {
    return null
  }
}

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
): PortalProfileConfig {
  const urlProfileId = readPortalProfileIdFromSearch(search)
  const profileId = urlProfileId || storageGet(storage) || 'code-collective'
  if (urlProfileId) storageSet(urlProfileId, storage)
  return PORTAL_PROFILES[profileId]
}

export function isPortalFeatureEnabled(feature: PortalFeature, profile = getActivePortalProfileConfig()): boolean {
  return !profile.disabledFeatures.includes(feature)
}

export function portalProfileLoginSearch(profileId: PortalProfileId): string {
  return `portalProfile=${encodeURIComponent(profileId)}`
}
