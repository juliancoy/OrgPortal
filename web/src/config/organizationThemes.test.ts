import { afterEach, expect, it, vi } from 'vitest'
import { parseOrganizationThemes, portalThemeColors } from '../../../shared/organizationThemes'
import { setGroupSite } from './timebankCommunity'
import { applyOrganizationTheme, readOrganizationTheme, selectOrganizationTheme } from './organizationThemes'

const themes = { defaultTheme: 'ocean', themes: [
  { id: 'ocean', name: 'Ocean', light: { primary: '#123456' }, dark: { primary: '#ABCDEF' } },
  { id: 'forest', name: 'Forest', light: { primary: '#234567' }, dark: { primary: '#BCDEFA' } },
] }
const site = (id: string) => ({ id, organization_id: id, hostname: `${id}.example`, name: id, tagline: '', accent_color: '#123456', feature_config: { brandThemes: themes } })

afterEach(() => { setGroupSite(null); vi.unstubAllGlobals() })

it('stores choices per organization, handles removed themes, and tolerates unavailable storage', () => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) })
  const style = { textContent: '', remove: vi.fn() }
  vi.stubGlobal('document', { getElementById: () => style, documentElement: { dataset: {} } })
  setGroupSite(site('one'))
  expect(readOrganizationTheme()).toBe('ocean')
  selectOrganizationTheme('forest')
  expect(readOrganizationTheme()).toBe('forest')
  expect(style.textContent).toContain('--primary:#234567')
  expect(style.textContent).toContain('--primary:#BCDEFA')
  setGroupSite(site('two'))
  expect(readOrganizationTheme()).toBe('ocean')
  setGroupSite(site('one'))
  expect(readOrganizationTheme()).toBe('forest')
  values.set('orgportal.organization-theme.one', 'deleted')
  expect(readOrganizationTheme()).toBe('ocean')
  vi.stubGlobal('localStorage', { getItem: () => { throw Error('blocked') }, setItem: () => { throw Error('blocked') } })
  expect(readOrganizationTheme()).toBe('ocean')
  selectOrganizationTheme('forest')
  expect(style.textContent).toContain('--primary:#234567')
  setGroupSite(null)
  applyOrganizationTheme()
  expect(style.remove).toHaveBeenCalled()
})

it('rejects malformed public configuration before generating CSS', () => {
  for (const value of [null, [], { ...themes, themes: [null] }, { ...themes, defaultTheme: 'missing' },
    { ...themes, themes: [{ ...themes.themes[0], dark: { primary: '</style><script>' } }] }]) {
    expect(parseOrganizationThemes(value)).toBeNull()
  }
})


it('harmonizes component aliases with core portal colors and respects explicit mappings', () => {
  const colors = portalThemeColors({ primary: '#123456', surface: '#F0FAFF', panel: '#FFFFFF', 'text-primary': '#102030', 'on-primary': '#FFFFFF', border: '#445566', 'btn-primary-bg': '#005588' })
  expect(colors['action-bg']).toBe('#123456')
  expect(colors['btn-primary-bg']).toBe('#005588')
  expect(colors['btn-primary-text']).toBe('#FFFFFF')
  expect(colors['body-bg']).toBe('#F0FAFF')
  expect(colors.ink).toBe('#102030')
  expect(colors['color-border']).toBe('#445566')
  expect(colors['paper-rgb']).toBe('255, 255, 255')
})
