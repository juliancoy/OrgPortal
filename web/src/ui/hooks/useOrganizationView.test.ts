import { describe, expect, it } from 'vitest'
import { resolveOrganizationPageView, resolveOrganizationView, useOrganizationViewPreference } from './useOrganizationView'

describe('organization views', () => {
  it('defaults organizers to their dashboard and members to their member view', () => {
    expect(resolveOrganizationView(null, true, true)).toBe('organizers')
    expect(resolveOrganizationView(null, false, true)).toBe('members')
    expect(resolveOrganizationView(null, false, false)).toBe('public')
  })
  it('allows an organizer to view the public page without changing permissions', () => {
    expect(resolveOrganizationView('public', true, true)).toBe('public')
  })
  it('does not grant member or organizer access through a URL', () => {
    expect(resolveOrganizationView('organizers', false, false)).toBe('public')
    expect(resolveOrganizationView('organizers', false, true)).toBe('members')
    expect(resolveOrganizationView('members', false, false)).toBe('public')
  })
})


describe('organization profile and dashboard routes', () => {
  it('keeps public profiles public regardless of saved view or permissions', () => {
    for (const view of [null, 'public', 'members', 'organizers']) {
      expect(resolveOrganizationPageView(false, view, true, true)).toBe('public')
    }
  })
  it('opens the dashboard with the permitted workspace even after viewing the public profile', () => {
    expect(resolveOrganizationPageView(true, 'public', true, true)).toBe('organizers')
    expect(resolveOrganizationPageView(true, null, false, true)).toBe('members')
    expect(resolveOrganizationPageView(true, 'organizers', false, true)).toBe('members')
    expect(resolveOrganizationPageView(true, 'organizers', false, false)).toBe('public')
  })
})


it('selects views only from the URL and never carries a selection into another navigation', () => {
  expect(useOrganizationViewPreference('lifetech', 'members')).toBe('members')
  expect(useOrganizationViewPreference('lifetech', null)).toBeNull()
  expect(useOrganizationViewPreference('other', null)).toBeNull()
  expect(useOrganizationViewPreference('lifetech', 'invalid')).toBeNull()
})
