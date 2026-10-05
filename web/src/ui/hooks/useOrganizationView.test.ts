import { describe, expect, it } from 'vitest'
import { resolveOrganizationView } from './useOrganizationView'

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
