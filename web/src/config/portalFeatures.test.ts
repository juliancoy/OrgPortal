import { describe, expect, it, vi } from 'vitest'
import * as communities from './timebankCommunity'
import {
  getActivePortalProfileConfig,
  isPortalFeatureEnabled,
  portalProfileLoginSearch,
  readPortalProfileIdFromSearch,
} from './portalFeatures'
import { parsePortalTenant } from './timebankCommunity'

function memoryStorage(initialValue?: string) {
  let value = initialValue
  return {
    getItem: () => value ?? null,
    setItem: (_key: string, nextValue: string) => {
      value = nextValue
    },
    value: () => value,
  }
}

describe('portal feature profiles', () => {
  it('does not infer MedTech from hostname without tenant metadata', () => {
    const profile = getActivePortalProfileConfig('?portalProfile=code-collective', memoryStorage('code-collective'), 'medtech.social')
    expect(profile.id).toBe('code-collective')
    expect(profile.memberHomePath).toBe('/chat')
  })
  it('keeps UBI enabled for the default Code Collective profile', () => {
    const profile = getActivePortalProfileConfig('', memoryStorage())

    expect(profile.id).toBe('code-collective')
    expect(isPortalFeatureEnabled('ubi', profile)).toBe(true)
  })

  it('disables UBI for the Baltimore MedTech profile', () => {
    const storage = memoryStorage()
    const profile = getActivePortalProfileConfig('?portalProfile=baltimore-medtech', storage)

    expect(profile.id).toBe('baltimore-medtech')
    expect(isPortalFeatureEnabled('ubi', profile)).toBe(false)
    expect(storage.value()).toBe('baltimore-medtech')
  })

  it('accepts profile aliases from public-site login links', () => {
    expect(readPortalProfileIdFromSearch('site=medtech')).toBe('baltimore-medtech')
    expect(portalProfileLoginSearch('baltimore-medtech')).toBe('portalProfile=baltimore-medtech')
  })

  it('lets a hostname timebank tenant keep its identity and landing page', () => {
    const domain = vi.spyOn(communities, 'getDomainTenant').mockReturnValue({
      id: 'bmoretimebank', hostname: 'bmoretimebank.codecollective.us',
      name: 'Bmore Timebank', tagline: 'Neighbors helping neighbors', accent_color: '#18745b',
      profile: 'community', features: ['timebank'],
    })
    try {
      const profile = getActivePortalProfileConfig('?portalProfile=baltimore-medtech', memoryStorage())
      expect(profile.brandName).toBe('Bmore Timebank')
      expect(profile.memberHomePath).toBe('/')
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
      brand_image_path: '/images/baltimore-medtech-logo-square.jpg',
      home_url: 'https://medtech.social/',
      member_home_path: '/community',
      manifest_path: '/medtech.webmanifest',
      theme_color: '#061a26',
    })
    try {
      const profile = getActivePortalProfileConfig('?portalProfile=code-collective', memoryStorage('code-collective'), 'custom.example')
      expect(profile.id).toBe('baltimore-medtech')
      expect(profile.tenantId).toBe('baltimore-medtech')
      expect(profile.brandImagePath).toBe('/images/baltimore-medtech-logo-square.jpg')
      expect(profile.memberHomePath).toBe('/community')
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
      home_kind: 'org-events',
      home_org_slug: 'baltimore-medtech',
      public_base_url: 'https://medtech.social',
      canonical_path_prefix: '',
      feature_config: '{"orgEvents":{"enabled":true}}',
    })

    expect(tenant?.features).toEqual(['directory', 'events', 'chat'])
    expect(tenant?.home_kind).toBe('org-events')
    expect(tenant?.public_base_url).toBe('https://medtech.social')
    expect(tenant?.feature_config?.orgEvents).toEqual({ enabled: true })
    expect(parsePortalTenant({ hostname: 'missing-id' })).toBeNull()
  })
})
