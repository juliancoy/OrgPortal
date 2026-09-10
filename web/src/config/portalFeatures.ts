import { getDomainTenant, type PortalTenant } from './timebankCommunity'
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
  manifestPath: string
  faviconPath: string
  faviconType: string
  themeColor: string
  tenantId?: string
}

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
    manifestPath: '/manifest.webmanifest',
    faviconPath: '/codecollective_logo.png',
    faviconType: 'image/png',
    themeColor: '#12325b',
  },
  'baltimore-medtech': {
    id: 'baltimore-medtech',
    brandName: 'Baltimore MedTech',
    portalTitle: 'Baltimore MedTech Portal',
    tagline: 'Health × Medicine × Biotech',
    brandImagePath: '/images/baltimore-medtech-logo-square.jpg',
    homeUrl: 'https://medtech.social/',
    memberHomePath: '/chat',
    disabledFeatures: ['ubi'],
    manifestPath: '/medtech.webmanifest',
    faviconPath: '/images/baltimore-medtech-logo-square.jpg',
    faviconType: 'image/jpeg',
    themeColor: '#061a26',
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

function tenantProfileConfig(tenant: PortalTenant): PortalProfileConfig {
  const profileId = normalizeProfileId(tenant.profile) || 'code-collective'
  const base = PORTAL_PROFILES[profileId]
  const features = new Set(tenant.features || [])
  const disabledFeatures = features.size
    ? (['ubi'] as PortalFeature[]).filter((feature) => !features.has(feature))
    : base.disabledFeatures
  const brandImagePath = tenant.brand_image_path || base.brandImagePath
  return {
    ...base,
    id: profileId,
    tenantId: tenant.id,
    brandName: tenant.name || base.brandName,
    portalTitle: tenant.name ? `${tenant.name} Portal` : base.portalTitle,
    tagline: tenant.tagline || base.tagline,
    brandImagePath,
    homeUrl: tenant.home_url || base.homeUrl,
    memberHomePath: tenant.member_home_path || (profileId === 'code-collective' && tenant.features?.includes('timebank') ? '/' : base.memberHomePath),
    disabledFeatures,
    manifestPath: tenant.manifest_path || base.manifestPath,
    faviconPath: brandImagePath || base.faviconPath,
    faviconType: brandImagePath?.endsWith('.png') ? 'image/png' : brandImagePath?.endsWith('.webp') ? 'image/webp' : base.faviconType,
    themeColor: tenant.theme_color || tenant.accent_color || base.themeColor,
  }
}

export function getActivePortalProfileConfig(
  _search = typeof window === 'undefined' ? '' : window.location.search,
  _storage: Pick<Storage, 'getItem' | 'setItem'> | null = null,
  _hostname = typeof window === 'undefined' ? '' : window.location.hostname,
): PortalProfileConfig {
  const tenant = getDomainTenant()
  if (tenant) return tenantProfileConfig(tenant)
  return PORTAL_PROFILES['code-collective']
}

export function isPortalFeatureEnabled(feature: PortalFeature, profile = getActivePortalProfileConfig()): boolean {
  return !profile.disabledFeatures.includes(feature)
}

export function portalProfilePath(path: string, profile = getActivePortalProfileConfig()): string {
  if (!profile.tenantId) return path
  const url = new URL(path, 'https://portal.invalid')
  if (url.origin !== 'https://portal.invalid') throw new Error('Expected an internal portal path')
  return `${url.pathname}${url.search}${url.hash}`
}
