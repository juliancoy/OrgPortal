import { describe, expect, it } from 'vitest'
import { groupOrganizationEvents } from './organizationEvents'

describe('organization event sections', () => {
  const org = { id: 'lifetech-id', slug: 'lifetech' }
  it('keeps hosted events above related events even when related events happen sooner', () => {
    const events = [
      { id: 'nearby', host_org_id: 'partner', starts_at: '2026-10-07' },
      { id: 'own-later', host_org_id: org.id, starts_at: '2026-10-20' },
      { id: 'own-sooner', host_org_id: org.id, event_date: '2026-10-10' },
      { id: 'undated', host_org_id: org.id },
    ]
    const groups = groupOrganizationEvents(events, org)
    expect(groups.map(group => group.kind)).toEqual(['hosted', 'related'])
    expect(groups[0].events.map(event => event.id)).toEqual(['own-sooner', 'own-later', 'undated'])
    expect(groups[1].events.map(event => event.id)).toEqual(['nearby'])
    expect(events[0].id).toBe('nearby')
  })
  it('does not assign other hosts to LifeTech by a matching label or slug', () => {
    const groups = groupOrganizationEvents([
      { id: 'import', organization_slug: 'lifetech' },
      { id: 'partner', host_org_id: 'partner', organization_slug: 'lifetech' },
    ], org)
    expect(groups[0].events.map(event => event.id)).toEqual(['import'])
    expect(groups[1].events.map(event => event.id)).toEqual(['partner'])
  })
  it('retains an empty hosted section above the nearby events', () => {
    const groups = groupOrganizationEvents([{ host_org_id: 'partner' }], org)
    expect(groups[0].events).toEqual([])
    expect(groups[1].events).toHaveLength(1)
  })
})
