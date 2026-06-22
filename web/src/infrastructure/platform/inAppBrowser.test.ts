import { describe, expect, it } from 'vitest'
import { externalBrowserUrl, isLinkedInInAppBrowser } from './inAppBrowser'

describe('inAppBrowser', () => {
  it('detects LinkedIn in-app browser user agents', () => {
    expect(isLinkedInInAppBrowser('Mozilla/5.0 [LinkedInApp]')).toBe(true)
    expect(isLinkedInInAppBrowser('Mozilla/5.0 LinkedIn/9.1.2')).toBe(true)
    expect(isLinkedInInAppBrowser('Mozilla/5.0 Chrome/120 Safari/537.36')).toBe(false)
  })

  it('builds Android Chrome intent URLs with a browser fallback', () => {
    const href = 'https://codecollective.us/p/users/thewolfonworldstreetsllc?from=linkedin#login'
    expect(externalBrowserUrl(href, 'Mozilla/5.0 Android LinkedInApp')).toBe(
      `intent://codecollective.us/p/users/thewolfonworldstreetsllc?from=linkedin#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`,
    )
  })

  it('builds iOS Chrome URLs when Safari cannot be forced from a webpage', () => {
    expect(externalBrowserUrl('https://codecollective.us/p/users/julian-coy', 'Mozilla/5.0 iPhone LinkedInApp')).toBe(
      'googlechromes://codecollective.us/p/users/julian-coy',
    )
  })
})
