import { describe, expect, it, vi } from 'vitest'
import * as communities from './timebankCommunity'
import {
  getActivePortalProfileConfig,
  tenantProfileConfig,
  isPortalFeatureEnabled,
} from './portalFeatures'
import { parseGroupSite } from './timebankCommunity'

describe('portal feature profiles', () => {
  it('does not infer MedTech from hostname without tenant metadata', () => {
    const profile = getActivePortalProfileConfig('', null, 'medtech.social')
    expect(profile.id).toBe('orgportal')
    expect(profile.memberHomePath).toBe('/communities')
  })
  it('keeps UBI enabled for the explicit Code Collective host', () => {
    const profile = getActivePortalProfileConfig('', null, 'codecollective.us')

    expect(profile.id).toBe('code-collective')
    expect(isPortalFeatureEnabled('ubi', profile)).toBe(true)
  })

  it('lets a hostname timebank tenant keep its identity and landing page', () => {
    const domain = vi.spyOn(communities, 'getGroupSite').mockReturnValue({
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
    const domain = vi.spyOn(communities, 'getGroupSite').mockReturnValue({
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
      expect(profile.groupSiteId).toBe('baltimore-medtech')
      expect(profile.brandImagePath).toBe('/images/baltimore-medtech-logo-square-v2.jpg')
      expect(profile.memberHomePath).toBe('/chat')
      expect(profile.manifestPath).toBe('/medtech.webmanifest')
      expect(isPortalFeatureEnabled('ubi', profile)).toBe(false)
    } finally { domain.mockRestore() }
  })

  it('validates tenant config from the backend before applying routing and branding', () => {
    const tenant = parseGroupSite({
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
    expect(parseGroupSite({ hostname: 'missing-id' })).toBeNull()
  })
})


it('resolves Deism branding and routes from tenant metadata on either mount', () => {
  for (const canonical_path_prefix of ['/p', '']) {
    const domain = vi.spyOn(communities, 'getGroupSite').mockReturnValue({
      id: 'deism', hostname: 'portal.deism.church', name: 'Deism',
      tagline: 'Reason, nature, and community', accent_color: '#14532d',
      profile: 'deism', features: ['directory', 'events', 'calendar', 'chat'],
      canonical_path_prefix,
    })
    try {
      const profile = getActivePortalProfileConfig()
      expect(profile.id).toBe('deism')
      expect(profile.groupSiteId).toBe('deism')
      expect(profile.brandImagePath).toBe('/images/deism/icon-512.png')
      expect(profile.manifestPath).toBe('/deism.webmanifest')
      expect(profile.homeUrl).toBe('https://deism.church/')
      expect(profile.memberHomePath).toBe('/chat')
      expect(isPortalFeatureEnabled('ubi', profile)).toBe(false)
    } finally { domain.mockRestore() }
  }
})


it('uses the attached domain homepage for a stale slug-portal logo link', () => {
  const domain = vi.spyOn(communities, 'getGroupSite').mockReturnValue({
    id: 'lifetech', name: 'LifeTech', slug: 'lifetech', hostname: 'lifetech.fyi',
    tagline: '', accent_color: '#155e59', home_url: 'https://lifetech.fyi/portals/lifetech',
    custom_domain_hostname: 'lifetech.fyi', custom_domain_status: 'attached',
  })
  try { expect(getActivePortalProfileConfig().homeUrl).toBe('https://lifetech.fyi/') }
  finally { domain.mockRestore() }
})

it('canonicalizes stored portal destinations and preserves external homepages', () => {
  for (const home_url of ['https://codecollective.us/p/portals/lifetech', 'https://lifetech.fyi/about']) {
    const domain = vi.spyOn(communities, 'getGroupSite').mockReturnValue({
      id: 'lifetech', name: 'LifeTech', slug: 'lifetech', hostname: 'lifetech.fyi',
      tagline: '', accent_color: '#155e59', home_url, home_org_slug:'lifetech',
      custom_domain_hostname: 'lifetech.fyi', custom_domain_status: 'attached',
    })
    try { expect(getActivePortalProfileConfig().homeUrl).toBe(home_url.includes('/portals/')?'https://codecollective.us/p/orgs/lifetech':home_url) }
    finally { domain.mockRestore() }
  }
})


it('OrgPortal is neutral even while tenant metadata is unavailable', () => {
  const domain = vi.spyOn(communities, 'getGroupSite').mockReturnValue(null)
  try {
    const profile = getActivePortalProfileConfig('', null, 'orgportal.cc')
    expect(profile.id).toBe('orgportal')
    expect(profile.brandName).toBe('OrgPortal')
    expect(profile.memberHomePath).toBe('/communities')
    expect(profile.brandImagePath).toBe('/orgportal.svg')
    expect(isPortalFeatureEnabled('ubi', profile)).toBe(false)
  } finally { domain.mockRestore() }
})


it('uses LifeTech identity from explicit tenant metadata', () => {
  const domain = vi.spyOn(communities, 'getGroupSite').mockReturnValue({
    id: 'lifetech', slug: 'lifetech', hostname: 'lifetech.fyi', name: 'LifeTech',
    profile: 'community', features: ['directory', 'events', 'chat'], tagline: '', accent_color: '#155e59',
  })
  try {
    expect(getActivePortalProfileConfig().id).toBe('lifetech')
    expect(getActivePortalProfileConfig().brandImagePath).toContain('lifetech-logo.png')
  } finally { domain.mockRestore() }
})

for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
  it(`keeps ${hostname} neutral even with the historical Code Collective API default`, () => {
    const domain = vi.spyOn(communities, 'getGroupSite').mockReturnValue({ id:'code-collective', hostname:'codecollective.us',name:'Code Collective',profile:'code-collective',tagline:'Coding a New Economy',accent_color:'#12325b',features:['directory','events','chat','ubi'] })
    try {
      const profile = getActivePortalProfileConfig('',null,hostname)
      expect(profile.id).toBe('orgportal')
      expect(profile.brandName).toBe('OrgPortal')
      expect(profile.brandImagePath).toBe('/orgportal.svg')
      expect(profile.manifestPath).toBe('/orgportal.webmanifest')
      expect(profile.memberHomePath).toBe('/')
    } finally { domain.mockRestore() }
  })
}

 it('renders a supplied organization brand without changing the portal identity', () => {
  const before=getActivePortalProfileConfig('',null,'orgportal.cc')
  const brand=tenantProfileConfig({id:'org-test',name:'Dummy Organization',hostname:'dummy.slug.portal.local',tagline:'Community',accent_color:'#123456',brand_image_path:'/dummy-logo.png'})
  expect(brand.brandName).toBe('Dummy Organization')
  expect(brand.brandImagePath).toBe('/dummy-logo.png')
  expect(getActivePortalProfileConfig('',null,'orgportal.cc')).toEqual(before)
 })

it('uses a separate tenant name banner without changing the logo or favicon', () => {
  const brand = tenantProfileConfig({id:'life', name:'LifeTech', hostname:'lifetech.fyi', profile:'lifetech', tagline:'Community', accent_color:'#155e59', brand_image_path:'/square.png', feature_config:{ nameBannerUrl:'https://lifetech.fyi/banner.webp' }})
  expect(brand.nameBannerUrl).toBe('https://lifetech.fyi/banner.webp')
  expect(brand.brandImagePath).toBe('/square.png')
  expect(brand.faviconPath).toBe('/square.png')
})

it('keeps an unconfigured organization identity neutral and its tagline empty', () => {
 const profile=tenantProfileConfig({id:'anchor',slug:'anchor',hostname:'lifetech.fyi',name:'Anchor Advance Care',tagline:'',accent_color:'#155e59'})
 expect(profile.tagline).toBe('')
 expect(profile.brandName).toBe('Anchor Advance Care')
 expect(profile.id).toBe('orgportal')
 expect(profile.nameBannerUrl).toBeUndefined()
})


it('uses current themed icon instead of a stale name banner',()=>{
 const site={id:'theme-test',name:'Theme test',hostname:'example.invalid',tagline:'',accent_color:'#175c53',brand_image_path:'https://example.invalid/new-icon.svg',feature_config:{nameBannerUrl:'https://example.invalid/old-banner.png',brandThemes:{defaultTheme:'test'}}}
 expect(tenantProfileConfig(site).nameBannerUrl).toBeUndefined()
 expect(tenantProfileConfig(site).brandImagePath).toBe(site.brand_image_path)
 expect(tenantProfileConfig({...site,feature_config:{nameBannerUrl:'https://example.invalid/old-banner.png'}}).nameBannerUrl).toBe('https://example.invalid/old-banner.png')
})
