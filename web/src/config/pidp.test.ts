import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultPostLoginPath, normalizePostLoginPath, portalAuthCallbackUrl } from './pidp'
import * as profiles from './portalFeatures'

afterEach(() => vi.restoreAllMocks())

describe('profile-aware authentication destinations', () => {
  function medtech() {
    const profile = profiles.getActivePortalProfileConfig('?portalProfile=baltimore-medtech', null)
    vi.spyOn(profiles, 'getActivePortalProfileConfig').mockReturnValue(profile)
  }

  it('uses the MedTech member home and carries the brand through the shared callback', () => {
    medtech()
    expect(defaultPostLoginPath()).toBe('/community?portalProfile=baltimore-medtech')
    const callback = new URL(portalAuthCallbackUrl('/people?q=medicine#results'))
    expect(callback.searchParams.get('portalProfile')).toBe('baltimore-medtech')
    expect(callback.searchParams.get('next')).toBe('/people?q=medicine&portalProfile=baltimore-medtech#results')
  })

  it('rejects external destinations and avoids login loops even with query strings', () => {
    medtech()
    for (const next of ['https://evil.example/path', '//evil.example/path', '/?portalProfile=baltimore-medtech', '/users/login?next=/community', '/auth/callback?next=/people']) {
      expect(normalizePostLoginPath(next)).toBe('/community?portalProfile=baltimore-medtech')
    }
  })

  it('uses the shared chat for the Code Collective profile', () => {
    expect(defaultPostLoginPath()).toBe('/chat')
    expect(new URL(portalAuthCallbackUrl('/people')).searchParams.has('portalProfile')).toBe(false)
  })
})
