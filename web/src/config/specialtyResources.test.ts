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
  it('keeps branding out of specialty resources', () => {
    expect(specialtyResourcesForTenant(tenant())).toEqual([])
  })

  it('removes stale configured brand-guide links', () => {
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
    ])
  })

  it('keeps MedTech specialty defaults without tenant branding', () => {
    const resources = specialtyResourcesForTenant(tenant({ id: 'baltimore-medtech', profile: 'baltimore-medtech' }))

    expect(resources.some((resource) => resource.id === 'map')).toBe(true)
    expect(resources.some((resource) => resource.id === 'brand-guide')).toBe(false)
  })
})
