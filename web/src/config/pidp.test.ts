import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultPostLoginPath, normalizePidpBase, normalizePostLoginPath, portalAuthCallbackUrl, pidpSingleSignOnUrl } from './pidp'
import * as profiles from './portalFeatures'
import { setGroupSite } from './timebankCommunity'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setGroupSite(null)
})

describe('profile-aware authentication destinations', () => {
  function medtech() {
    setGroupSite({
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

  it('returns Code Collective website sign-in to its organization', () => {
    vi.stubGlobal('window', { location: { origin:'https://codecollective.us',hostname:'codecollective.us',search:'' } })
    expect(defaultPostLoginPath()).toBe('/orgs/code-collective')
    expect(new URL(portalAuthCallbackUrl('/people')).searchParams.has('portalProfile')).toBe(false)
  })

  it('keeps shared slug portal login callbacks under the shared mount', () => {
    vi.stubEnv('BASE_URL', '/p/')
    setGroupSite({
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

it('single sign-on keeps callback and navigation on the current tenant origin', () => {
  vi.stubGlobal('window', { location: { origin: 'https://tenant.example', hostname: 'tenant.example' } })
  setGroupSite({ id: 'tenant', hostname: 'tenant.example', name: 'Tenant', tagline: '', accent_color: '#123456', canonical_path_prefix: '' })
  const login = new URL(pidpSingleSignOnUrl('/people?q=medicine', 'google'), 'https://tenant.example')
  expect(login.pathname).toBe('/pidp/auth/sso/start')
  expect(login.searchParams.get('provider')).toBe('google')
  const callback = new URL(login.searchParams.get('next')!)
  expect(callback.origin).toBe('https://tenant.example')
  expect(callback.pathname).toBe('/auth/callback')
  expect(callback.searchParams.get('next')).toBe('/people?q=medicine')
})


it('OrgPortal uses neutral destinations while preserving the shared account application', () => {
  vi.stubGlobal('window', { location: { origin: 'https://orgportal.cc', hostname: 'orgportal.cc' } })
  setGroupSite({ id: 'orgportal', hostname: 'orgportal.cc', name: 'OrgPortal', tagline: '', accent_color: '#155e59', profile: 'orgportal', features: ['directory', 'events', 'chat'], member_home_path: '/communities', canonical_path_prefix: '' })
  expect(defaultPostLoginPath()).toBe('/communities')
  const callback = new URL(portalAuthCallbackUrl('/orgs?view=mine'))
  expect(callback.origin + callback.pathname).toBe('https://orgportal.cc/auth/callback')
  expect(callback.searchParams.get('next')).toBe('/orgs?view=mine')
  for (const next of ['//evil.example', 'https://evil.example', '/users/login', '/auth/callback']) expect(normalizePostLoginPath(next)).toBe('/communities')
  const login = new URL(pidpSingleSignOnUrl('/communities'), 'https://orgportal.cc')
  expect(login.origin).toBe('https://orgportal.cc')
  expect(login.searchParams.get('app')).toBe('orgportal')
})

it('keeps central path-mounted identity on the tenant proxy for browser cookies', () => {
  vi.stubGlobal('window', {location:{origin:'https://lifetech.fyi',hostname:'lifetech.fyi'}})
  expect(normalizePidpBase('https://orgportal.cc/pidp')).toBe('/pidp')
})

it('explicit portal sign-in offers account selection and provider sign-in requests fresh proof', () => {
  vi.stubGlobal('window', { location: { origin:'https://lifetech.fyi', hostname:'lifetech.fyi' } })
  const login = new URL(pidpSingleSignOnUrl('/orgs/lifetech'), 'https://lifetech.fyi')
  expect(login.searchParams.get('prompt')).toBe('select_account')
  expect(new URL(login.searchParams.get('next')!).searchParams.get('next')).toBe('/orgs/lifetech')
  for (const provider of ['google', 'github'] as const) {
    const social = new URL(pidpSingleSignOnUrl('/orgs/lifetech', provider), 'https://lifetech.fyi')
    expect(social.searchParams.get('prompt')).toBe('login')
    expect(social.searchParams.get('provider')).toBe(provider)
  }
})
