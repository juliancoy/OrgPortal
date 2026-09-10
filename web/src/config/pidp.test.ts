import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultPostLoginPath, normalizePidpBase, normalizePostLoginPath, portalAuthCallbackUrl } from './pidp'
import * as profiles from './portalFeatures'
import { setDomainTenant } from './timebankCommunity'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setDomainTenant(null)
})

describe('profile-aware authentication destinations', () => {
  function medtech() {
    setDomainTenant({
      id: 'baltimore-medtech',
      hostname: 'medtech.social',
      name: 'Baltimore MedTech',
      tagline: 'Health x Medicine x Biotech',
      accent_color: '#0f6f8f',
      profile: 'baltimore-medtech',
      features: ['directory', 'events', 'chat'],
      member_home_path: '/chat',
    })
    const profile = profiles.getActivePortalProfileConfig()
    vi.spyOn(profiles, 'getActivePortalProfileConfig').mockReturnValue(profile)
  }

  it('uses the tenant member home without profile query parameters', () => {
    medtech()
    expect(defaultPostLoginPath()).toBe('/chat')
    const callback = new URL(portalAuthCallbackUrl('/people?q=medicine#results'))
    expect(callback.searchParams.has('portalProfile')).toBe(false)
    expect(callback.searchParams.get('next')).toBe('/people?q=medicine#results')
  })

  it('rejects external destinations and avoids login loops even with query strings', () => {
    medtech()
    for (const next of ['https://evil.example/path', '//evil.example/path', '/', '/p/users/login?next=/org-events', '/users/login?next=/org-events', '/auth/callback?next=/people']) {
      expect(normalizePostLoginPath(next)).toBe('/chat')
    }
  })

  it('uses the shared chat for the Code Collective profile', () => {
    expect(defaultPostLoginPath()).toBe('/chat')
    expect(new URL(portalAuthCallbackUrl('/people')).searchParams.has('portalProfile')).toBe(false)
  })

  it('keeps shared slug portal login callbacks under the shared mount', () => {
    vi.stubEnv('BASE_URL', '/p/')
    setDomainTenant({
      id: 'org-test-portal',
      organization_id: 'org-test',
      slug: 'test-org',
      hostname: 'test-org.slug.portal.local',
      name: 'Test Org',
      tagline: 'Test org portal',
      accent_color: '#155e59',
      profile: 'community',
      features: ['directory', 'events', 'chat'],
      member_home_path: '/chat',
      canonical_path_prefix: '/p',
    })
    const callback = new URL(portalAuthCallbackUrl('/portals/test-org'))
    expect(callback.toString()).toBe('https://codecollective.us/p/auth/callback?next=%2Fportals%2Ftest-org')
  })

  it('uses the same-origin PIdP proxy for browser sessions on tenant domains', () => {
    vi.stubGlobal('window', {
      location: { origin: 'https://medtech.social', hostname: 'medtech.social' },
    })
    expect(normalizePidpBase('https://id.codecollective.us')).toBe('/pidp')
    expect(normalizePidpBase('https://dev.id.codecollective.us/')).toBe('/pidp')
  })

  it('preserves non-first-party absolute PIdP bases for operators without the proxy', () => {
    vi.stubGlobal('window', {
      location: { origin: 'https://tenant.example', hostname: 'tenant.example' },
    })
    expect(normalizePidpBase('https://identity.example/root/')).toBe('https://identity.example/root')
  })
})
