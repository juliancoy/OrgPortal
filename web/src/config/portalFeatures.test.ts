import { describe, expect, it } from 'vitest'
import {
  getActivePortalProfileConfig,
  isPortalFeatureEnabled,
  portalProfileLoginSearch,
  readPortalProfileIdFromSearch,
} from './portalFeatures'

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
  it('selects MedTech by its custom domain even with a conflicting saved profile', () => {
    const profile = getActivePortalProfileConfig('?portalProfile=code-collective', memoryStorage('code-collective'), 'community.medtech.social')
    expect(profile.id).toBe('baltimore-medtech')
    expect(profile.memberHomePath).toBe('/community')
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

})
