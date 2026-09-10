import { describe, expect, it } from 'vitest'
import { internalTenantHomePath, tenantHomeAction } from './tenantHome'
import type { PortalTenant } from './timebankCommunity'

const baseTenant: PortalTenant = {
  id: 'tenant',
  hostname: 'tenant.test',
  name: 'Tenant',
  tagline: 'Tagline',
  accent_color: '#155e59',
  profile: 'community',
  features: ['directory', 'events', 'chat'],
}

describe('tenant home modes', () => {
  it('supports landing, route, org profile, org events, timebank and auth modes', () => {
    expect(tenantHomeAction({ ...baseTenant, home_kind: 'landing' }, 'guest', '/chat')).toEqual({ kind: 'landing' })
    expect(tenantHomeAction({ ...baseTenant, home_kind: 'route', home_path: '/people?q=medtech' }, 'guest', '/chat')).toEqual({ kind: 'redirect', to: '/people?q=medtech' })
    expect(tenantHomeAction({ ...baseTenant, home_kind: 'org', home_org_slug: 'baltimore-medtech' }, 'guest', '/chat')).toEqual({ kind: 'redirect', to: '/orgs/baltimore-medtech' })
    expect(tenantHomeAction({ ...baseTenant, home_kind: 'org-events', home_org_slug: 'baltimore-medtech' }, 'guest', '/chat')).toEqual({ kind: 'events' })
    expect(tenantHomeAction({ ...baseTenant, home_kind: 'timebank' }, 'guest', '/chat')).toEqual({ kind: 'redirect', to: '/timebanking' })
    expect(tenantHomeAction({ ...baseTenant, home_kind: 'auth', member_home_path: '/community' }, 'guest', '/community')).toEqual({ kind: 'redirect', to: '/users/login' })
    expect(tenantHomeAction({ ...baseTenant, home_kind: 'auth', member_home_path: '/community' }, 'member', '/community')).toEqual({ kind: 'redirect', to: '/community' })
  })

  it('rejects unsafe or circular configured home paths', () => {
    expect(internalTenantHomePath('https://evil.test/people')).toBeNull()
    expect(internalTenantHomePath('/users/login?next=/chat')).toBeNull()
    expect(internalTenantHomePath('/auth/callback')).toBeNull()
    expect(tenantHomeAction({ ...baseTenant, home_kind: 'route', home_path: '/users/login' }, 'guest', '/chat')).toEqual({ kind: 'landing' })
  })
})
