import { getGroupSite, type GroupSite } from './timebankCommunity'
import { canonicalOrganizationHref } from '../../../shared/organizationUrls'
export type PortalFeature = 'ubi'

export type PortalProfileId = 'code-collective' | 'baltimore-medtech' | 'deism' | 'orgportal' | 'lifetech'

export type PortalProfileConfig = {
  id: PortalProfileId
  brandName: string
  portalTitle: string
  tagline: string
  nameBannerUrl?: string
  brandImagePath?: string
  homeUrl: string
  memberHomePath: string
  disabledFeatures: PortalFeature[]
  manifestPath: string
  faviconPath: string
  faviconType: string
  appleTouchIconPath: string
  themeColor: string
  groupSiteId?: string
}

const PORTAL_PROFILES: Record<PortalProfileId, PortalProfileConfig> = {
  lifetech: {
    id: 'lifetech', brandName: 'LifeTech', portalTitle: 'LifeTech Portal',
    nameBannerUrl: '/images/lifetech-namebanner.webp',
    tagline: 'Health × Medicine × Biotech', brandImagePath: 'https://lifetech.fyi/assets/images/lifetech-logo.png',
    homeUrl: 'https://lifetech.fyi/', memberHomePath: '/chat', disabledFeatures: ['ubi'],
    manifestPath: '/manifest.webmanifest', faviconPath: 'https://lifetech.fyi/assets/images/lifetech-logo.png',
    faviconType: 'image/png', appleTouchIconPath: 'https://lifetech.fyi/assets/images/lifetech-logo.png', themeColor: '#155e59',
  },
  orgportal: {
    id: 'orgportal', brandName: 'OrgPortal', portalTitle: 'OrgPortal',
    tagline: 'A place for every community.', brandImagePath: '/orgportal.svg',
    homeUrl: '/', memberHomePath: '/communities', disabledFeatures: ['ubi'],
    manifestPath: '/orgportal.webmanifest', faviconPath: '/orgportal.svg',
    faviconType: 'image/svg+xml', appleTouchIconPath: '/orgportal.svg', themeColor: '#155e59',
  },
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
    appleTouchIconPath: '/codecollective_logo.png',
    themeColor: '#12325b',
  },
  deism: {
    id: 'deism',
    brandName: 'Deism',
    portalTitle: 'Deism Portal',
    tagline: 'Reason, nature, and community',
    brandImagePath: '/images/deism/icon-512.png',
    homeUrl: 'https://deism.church/',
    memberHomePath: '/chat',
    disabledFeatures: ['ubi'],
    manifestPath: '/deism.webmanifest',
    faviconPath: '/images/deism/icon-192.png',
    faviconType: 'image/png',
    appleTouchIconPath: '/images/deism/apple-touch-icon.png',
    themeColor: '#14532d',
  },
  'baltimore-medtech': {
    id: 'baltimore-medtech',
    brandName: 'Baltimore MedTech',
    portalTitle: 'Baltimore MedTech Portal',
    tagline: 'Health × Medicine × Biotech',
    brandImagePath: '/images/baltimore-medtech-logo-square-v2.jpg',
    homeUrl: 'https://medtech.social/',
    memberHomePath: '/chat',
    disabledFeatures: ['ubi'],
    manifestPath: '/medtech.webmanifest',
    faviconPath: '/images/baltimore-medtech-logo-square-v2.jpg',
    faviconType: 'image/jpeg',
    appleTouchIconPath: '/images/baltimore-medtech-logo-square-v2.jpg',
    themeColor: '#061a26',
  },
}

function normalizeProfileId(value?: string | null): PortalProfileId | null {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'orgportal') return 'orgportal'
  if (normalized === 'lifetech') return 'lifetech'
  if (normalized === 'deism') return 'deism'
  if (['baltimore-medtech', 'bmore-medtech', 'baltimoremedtech', 'medtech'].includes(normalized)) {
    return 'baltimore-medtech'
  }
  if (['code-collective', 'codecollective', 'default', 'main'].includes(normalized)) {
    return 'code-collective'
  }
  return null
}

function tenantBrandHomeUrl(tenant: GroupSite, fallback: string): string {
  return canonicalOrganizationHref(tenant.home_url,tenant.home_org_slug) || fallback
}

export function tenantProfileConfig(tenant: GroupSite): PortalProfileConfig {
  const profileId = normalizeProfileId(tenant.profile) || (tenant.slug === 'lifetech' ? 'lifetech' : 'orgportal')
  const base = PORTAL_PROFILES[profileId]
  const features = new Set(tenant.features || [])
  const isTimebank = features.has('timebank')
  const disabledFeatures = features.size
    ? (['ubi'] as PortalFeature[]).filter((feature) => !features.has(feature))
    : base.disabledFeatures
  const brandImagePath = tenant.brand_image_path || (isTimebank ? '/images/timebank/timebank-mark.svg' : base.brandImagePath)
  const faviconPath = tenant.brand_image_path
    ? brandImagePath || base.faviconPath
    : isTimebank ? '/images/timebank/favicon-64.png' : brandImagePath || base.faviconPath
  const faviconType = faviconPath.endsWith('.png')
    ? 'image/png'
    : faviconPath.endsWith('.webp')
      ? 'image/webp'
      : faviconPath.endsWith('.svg')
        ? 'image/svg+xml'
        : faviconPath.endsWith('.jpg') || faviconPath.endsWith('.jpeg')
          ? 'image/jpeg'
          : base.faviconType
  return {
    ...base,
    id: profileId,
    groupSiteId: tenant.id,
    brandName: tenant.name || base.brandName,
    portalTitle: profileId === 'orgportal' ? 'OrgPortal' : tenant.name ? `${tenant.name} Portal` : base.portalTitle,
    tagline: tenant.tagline ?? base.tagline,
    brandImagePath,
    nameBannerUrl: tenant.feature_config?.brandThemes && tenant.brand_image_path ? undefined : typeof tenant.feature_config?.nameBannerUrl === 'string' && /^https:\/\//.test(tenant.feature_config.nameBannerUrl) ? tenant.feature_config.nameBannerUrl : base.nameBannerUrl,
    homeUrl: tenantBrandHomeUrl(tenant, base.homeUrl),
    memberHomePath: tenant.member_home_path || (tenant.features?.includes('timebank') ? '/' : base.memberHomePath),
    disabledFeatures,
    manifestPath: tenant.manifest_path || (isTimebank ? '/timebank.webmanifest' : base.manifestPath),
    faviconPath,
    faviconType,
    appleTouchIconPath: tenant.brand_image_path || (isTimebank ? '/images/timebank/apple-touch-icon.png' : base.appleTouchIconPath),
    themeColor: tenant.theme_color || tenant.accent_color || base.themeColor,
  }
}

export function getActivePortalProfileConfig(
  _search = typeof window === 'undefined' ? '' : window.location.search,
  _storage: Pick<Storage, 'getItem' | 'setItem'> | null = null,
  _hostname = typeof window === 'undefined' ? '' : window.location.hostname,
): PortalProfileConfig {
  const tenant = getGroupSite()
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(_hostname.toLowerCase())
  // Loopback is the platform workspace, even when an older API still returns
  // its historical Code Collective default. Explicit tenant previews keep their branding.
  if (local && (!tenant || tenant.id === 'code-collective' || tenant.id === 'orgportal')) {
    return { ...PORTAL_PROFILES.orgportal, memberHomePath: '/', groupSiteId: tenant?.id === 'orgportal' ? tenant.id : undefined }
  }
  if (tenant) return tenantProfileConfig(tenant)
  const codeCollectiveHost = ['codecollective.us', 'www.codecollective.us', 'org-codecollective.jcloiacon.workers.dev', 'codecollective-site.jcloiacon.workers.dev'].includes(_hostname.toLowerCase())
  return PORTAL_PROFILES[codeCollectiveHost ? 'code-collective' : 'orgportal']
}

export function isPortalFeatureEnabled(feature: PortalFeature, profile = getActivePortalProfileConfig()): boolean {
  return !profile.disabledFeatures.includes(feature)
}

export function portalProfilePath(path: string, profile = getActivePortalProfileConfig()): string {
  if (!profile.groupSiteId) return path
  const url = new URL(path, 'https://portal.invalid')
  if (url.origin !== 'https://portal.invalid') throw new Error('Expected an internal portal path')
  return `${url.pathname}${url.search}${url.hash}`
}
