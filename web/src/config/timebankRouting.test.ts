import { afterEach, expect, test, vi } from 'vitest'
import { setDomainCommunity, setDomainTenant, timebankHomePath } from './timebankCommunity'
import { portalBasePath, portalPath } from './portalBase'
import { defaultPostLoginPath, normalizePostLoginPath, portalAuthCallbackUrl } from './pidp'
import { timebankListingPath, timebankNoticePath } from '../ui/timebank/links'

const tenant = { id: 'timebank', hostname: 'timebank.codecollective.us', name: 'Timebank', tagline: 'Share time', accent_color: '#155e59', profile: 'community', features: ['timebank'] }
afterEach(() => {
  setDomainCommunity({ ...tenant, id: 'code-collective', hostname: 'codecollective.us' })
  vi.unstubAllEnvs()
})

test('tenant navigation uses its root while the main portal uses the build base', () => {
  vi.stubEnv('BASE_URL', '/p/')
  setDomainCommunity(tenant)
  expect(portalBasePath()).toBe('')
  expect(portalPath('/users/login')).toBe('/users/login')
  expect(timebankHomePath()).toBe('/')
  expect(defaultPostLoginPath()).toBe('/')
  expect(timebankListingPath('a&b')).toBe('/?listing=a%26b')
  expect(timebankNoticePath('/timebanking?tab=activity&exchange=abc')).toBe('/?tab=activity&exchange=abc')
  expect(timebankNoticePath('//evil.test')).toBe('/?tab=notifications')
  setDomainCommunity({ ...tenant, id: 'code-collective' })
  expect(portalBasePath()).toBe('/p')
  expect(timebankHomePath()).toBe('/timebanking')
})

test('non-timebank tenant domains also use root portal routes', () => {
  vi.stubEnv('BASE_URL', '/p/')
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
  expect(portalBasePath()).toBe('')
  expect(portalPath('/users/login')).toBe('/users/login')
  expect(normalizePostLoginPath('/p/users/login?next=/org-events')).toBe('/chat')
  expect(portalAuthCallbackUrl('/org-events')).toContain('next=%2Forg-events')
})

test('shared sign-in callback keeps root listing destinations and rejects external returns', () => {
  vi.stubEnv('BASE_URL', '/p/')
  setDomainCommunity(tenant)
  expect(normalizePostLoginPath('/?listing=abc')).toBe('/?listing=abc')
  expect(normalizePostLoginPath('//evil.test')).toBe('/')
  const callback = new URL(portalAuthCallbackUrl('/?listing=abc'))
  expect(callback.origin + callback.pathname).toBe('https://codecollective.us/p/auth/callback')
  expect(callback.searchParams.get('community')).toBe('timebank')
  expect(callback.searchParams.get('next')).toBe('/?listing=abc')
})
