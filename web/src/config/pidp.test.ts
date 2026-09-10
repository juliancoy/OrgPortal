import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultPostLoginPath, normalizePostLoginPath, portalAuthCallbackUrl } from './pidp'
import * as profiles from './portalFeatures'
import { setDomainTenant } from './timebankCommunity'

afterEach(() => {
  vi.restoreAllMocks()
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
})
