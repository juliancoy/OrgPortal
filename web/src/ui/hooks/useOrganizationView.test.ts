import { afterEach, describe, expect, it, vi } from 'vitest'
import { readOrganizationView, saveOrganizationView, resolveOrganizationView } from './useOrganizationView'

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


describe('saved organization views', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('keeps selections per organization across navigation and still checks access', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
    vi.stubGlobal('window', { dispatchEvent: vi.fn() })
    saveOrganizationView('lifetech', 'public')
    expect(readOrganizationView('lifetech')).toBe('public')
    expect(readOrganizationView('other')).toBeNull()
    saveOrganizationView('lifetech', 'organizers')
    expect(resolveOrganizationView(readOrganizationView('lifetech'), false, false)).toBe('public')
    expect(resolveOrganizationView(readOrganizationView('lifetech'), true, true)).toBe('organizers')
    values.set('orgportal.organizationView.lifetech', 'invalid')
    expect(readOrganizationView('lifetech')).toBeNull()
  })
  it('tolerates unavailable browser storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('disabled') }, setItem: () => { throw new Error('disabled') } })
    vi.stubGlobal('window', { dispatchEvent: vi.fn() })
    expect(readOrganizationView('lifetech')).toBeNull()
    expect(() => saveOrganizationView('lifetech', 'public')).not.toThrow()
  })
})
