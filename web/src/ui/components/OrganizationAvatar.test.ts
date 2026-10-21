import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OrganizationAvatar, OrganizationPersonnelLegend } from './OrganizationAvatar'
import { personnelClasses, personnelClassForMembership, isPersonnelClass } from '../../../../shared/organizationPersonnel'

describe('constitution personnel avatars', () => {
  it('uses the exact colors in the personnel diagram and names every status accessibly', () => {
    expect(Object.values(personnelClasses).map(value => value.color)).toEqual(['#ffffff', '#351c75', '#000000', '#ff0000', '#1155cc', '#9900ff', '#38761d'])
    for (const status of Object.keys(personnelClasses) as (keyof typeof personnelClasses)[]) {
      const html = renderToStaticMarkup(createElement(OrganizationAvatar, { name: 'Example', status }))
      expect(html).toContain(`aria-label="Example · ${personnelClasses[status].label}"`)
      expect(html).toContain(`--personnel-color:${personnelClasses[status].color}`)
    }
    expect(renderToStaticMarkup(createElement(OrganizationPersonnelLegend))).toContain('Persona Non Grata')
  })
  it('maps only recorded active roles, without promoting pending organizers or inactive members', () => {
    expect(personnelClassForMembership({ role: 'owner', status: 'active' })).toBe('organizer')
    expect(personnelClassForMembership({ role: 'administrator' })).toBe('organizer')
    expect(personnelClassForMembership({ role: 'member' })).toBe('member')
    expect(personnelClassForMembership({ role: 'administrator', status: 'inactive' })).toBe('public')
    expect(personnelClassForMembership({ role: 'member', personnel_class: 'persona_non_grata' })).toBe('persona_non_grata')
    expect(isPersonnelClass('toString')).toBe(false)
  })
  it('distinguishes unavailable status from Public instead of guessing', () => {
    const html = renderToStaticMarkup(createElement(OrganizationAvatar, { name: 'Example', status: null }))
    expect(html).toContain('Status unavailable')
    expect(html).toContain('data-personnel-class="unknown"')
  })
})
