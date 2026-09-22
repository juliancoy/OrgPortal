import { describe, expect, it } from 'vitest'
import type { PortalTenant } from './timebankCommunity'
import { specialtyResourcesForTenant } from './specialtyResources'

function tenant(overrides: Partial<PortalTenant> = {}): PortalTenant {
  return {
    id: 'example',
    hostname: 'example.test',
    name: 'Example Organization',
    tagline: 'Working together',
    accent_color: '#176b87',
    ...overrides,
  }
}

describe('tenant specialty resources', () => {
  it('includes the generic brand guide for every tenant', () => {
    expect(specialtyResourcesForTenant(tenant())).toEqual([
      expect.objectContaining({ id: 'brand-guide', href: '/branding' }),
    ])
  })

  it('replaces stale configured brand-guide links with the generic route', () => {
    const resources = specialtyResourcesForTenant(tenant({
      feature_config: {
        specialtyResources: [
          { id: 'docs', label: 'Documentation', href: 'https://example.test/docs' },
          { id: 'brand-guide', label: 'Old guide', href: '/specialty/example/branding.html' },
        ],
      },
    }))

    expect(resources.map(({ id, href }) => ({ id, href }))).toEqual([
      { id: 'docs', href: 'https://example.test/docs' },
      { id: 'brand-guide', href: '/branding' },
    ])
  })

  it('keeps MedTech specialty defaults alongside tenant branding', () => {
    const resources = specialtyResourcesForTenant(tenant({ id: 'baltimore-medtech', profile: 'baltimore-medtech' }))

    expect(resources.some((resource) => resource.id === 'map')).toBe(true)
    expect(resources.at(-1)).toMatchObject({ id: 'brand-guide', href: '/branding' })
  })
})
