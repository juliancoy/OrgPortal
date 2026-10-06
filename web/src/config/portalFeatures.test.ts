import { describe, expect, it, vi } from 'vitest'
import * as communities from './timebankCommunity'
import {
  getActivePortalProfileConfig,
  isPortalFeatureEnabled,
} from './portalFeatures'
import { parsePortalTenant } from './timebankCommunity'

describe('portal feature profiles', () => {
  it('does not infer MedTech from hostname without tenant metadata', () => {
    const profile = getActivePortalProfileConfig('', null, 'medtech.social')
    expect(profile.id).toBe('code-collective')
    expect(profile.memberHomePath).toBe('/chat')
  })
  it('keeps UBI enabled for the default Code Collective profile', () => {
    const profile = getActivePortalProfileConfig()

    expect(profile.id).toBe('code-collective')
    expect(isPortalFeatureEnabled('ubi', profile)).toBe(true)
  })

  it('lets a hostname timebank tenant keep its identity and landing page', () => {
    const domain = vi.spyOn(communities, 'getDomainTenant').mockReturnValue({
      id: 'bmoretimebank', hostname: 'bmoretimebank.codecollective.us',
      name: 'Bmore Timebank', tagline: 'Neighbors helping neighbors', accent_color: '#18745b',
      profile: 'community', features: ['timebank'],
    })
    try {
      const profile = getActivePortalProfileConfig()
      expect(profile.brandName).toBe('Bmore Timebank')
      expect(profile.memberHomePath).toBe('/')
      expect(profile.brandImagePath).toBe('/images/timebank/timebank-mark.svg')
      expect(profile.faviconPath).toBe('/images/timebank/favicon-64.png')
      expect(profile.appleTouchIconPath).toBe('/images/timebank/apple-touch-icon.png')
      expect(profile.manifestPath).toBe('/timebank.webmanifest')
      expect(isPortalFeatureEnabled('ubi', profile)).toBe(false)
    } finally { domain.mockRestore() }
  })

  it('lets a configured tenant provide MedTech-level branding without a hostname special case', () => {
    const domain = vi.spyOn(communities, 'getDomainTenant').mockReturnValue({
      id: 'baltimore-medtech',
      hostname: 'medtech.social',
      name: 'Baltimore MedTech',
      tagline: 'Health x Medicine x Biotech',
      accent_color: '#0f6f8f',
      profile: 'baltimore-medtech',
      features: ['directory', 'events', 'chat'],
      brand_image_path: '/images/baltimore-medtech-logo-square-v2.jpg',
      home_url: 'https://medtech.social/',
      member_home_path: '/chat',
      manifest_path: '/medtech.webmanifest',
      theme_color: '#061a26',
    })
    try {
      const profile = getActivePortalProfileConfig('', null, 'custom.example')
      expect(profile.id).toBe('baltimore-medtech')
      expect(profile.tenantId).toBe('baltimore-medtech')
      expect(profile.brandImagePath).toBe('/images/baltimore-medtech-logo-square-v2.jpg')
      expect(profile.memberHomePath).toBe('/chat')
      expect(profile.manifestPath).toBe('/medtech.webmanifest')
      expect(isPortalFeatureEnabled('ubi', profile)).toBe(false)
    } finally { domain.mockRestore() }
  })

  it('validates tenant config from the backend before applying routing and branding', () => {
    const tenant = parsePortalTenant({
      id: 'medtech',
      hostname: 'medtech.social',
      name: 'Baltimore MedTech',
      tagline: 'Health x Medicine x Biotech',
      accent_color: '#0f6f8f',
      profile: 'baltimore-medtech',
      features: ['directory', 'events', 'chat', 42],
      home_kind: 'main',
      home_org_slug: 'baltimore-medtech',
      public_base_url: 'https://medtech.social',
      canonical_path_prefix: '',
      feature_config: '{"orgEvents":{"enabled":true}}',
    })

    expect(tenant?.features).toEqual(['directory', 'events', 'chat'])
    expect(tenant?.home_kind).toBe('main')
    expect(tenant?.public_base_url).toBe('https://medtech.social')
    expect(tenant?.feature_config?.orgEvents).toEqual({ enabled: true })
    expect(parsePortalTenant({ hostname: 'missing-id' })).toBeNull()
  })
})


it('resolves Deism branding and routes from tenant metadata on either mount', () => {
  for (const canonical_path_prefix of ['/p', '']) {
    const domain = vi.spyOn(communities, 'getDomainTenant').mockReturnValue({
      id: 'deism', hostname: 'portal.deism.church', name: 'Deism',
      tagline: 'Reason, nature, and community', accent_color: '#14532d',
      profile: 'deism', features: ['directory', 'events', 'calendar', 'chat'],
      canonical_path_prefix,
    })
    try {
      const profile = getActivePortalProfileConfig()
      expect(profile.id).toBe('deism')
      expect(profile.tenantId).toBe('deism')
      expect(profile.brandImagePath).toBe('/images/deism/icon-512.png')
      expect(profile.manifestPath).toBe('/deism.webmanifest')
      expect(profile.homeUrl).toBe('https://deism.church/')
      expect(profile.memberHomePath).toBe('/chat')
      expect(isPortalFeatureEnabled('ubi', profile)).toBe(false)
    } finally { domain.mockRestore() }
  }
})


it('uses the attached domain homepage for a stale slug-portal logo link', () => {
  const domain = vi.spyOn(communities, 'getDomainTenant').mockReturnValue({
    id: 'lifetech', name: 'LifeTech', slug: 'lifetech', hostname: 'lifetech.fyi',
    tagline: '', accent_color: '#155e59', home_url: 'https://lifetech.fyi/portals/lifetech',
    custom_domain_hostname: 'lifetech.fyi', custom_domain_status: 'attached',
  })
  try { expect(getActivePortalProfileConfig().homeUrl).toBe('https://lifetech.fyi/') }
  finally { domain.mockRestore() }
})

it('preserves configured shared portal and external homepage destinations', () => {
  for (const home_url of ['https://codecollective.us/p/portals/lifetech', 'https://lifetech.fyi/about']) {
    const domain = vi.spyOn(communities, 'getDomainTenant').mockReturnValue({
      id: 'lifetech', name: 'LifeTech', slug: 'lifetech', hostname: 'lifetech.fyi',
      tagline: '', accent_color: '#155e59', home_url,
      custom_domain_hostname: 'lifetech.fyi', custom_domain_status: 'attached',
    })
    try { expect(getActivePortalProfileConfig().homeUrl).toBe(home_url) }
    finally { domain.mockRestore() }
  }
})
