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

it('provides distinct icon, avatar and background imagery for every named preset and rejects unsafe images',async()=>{
 const {standardOrganizationThemes}=await import('../../../shared/organizationThemes')
 const config={defaultTheme:'postcapitalist-corporate',themes:standardOrganizationThemes}
 expect(parseOrganizationThemes(config)).not.toBeNull()
 for(const theme of config.themes)expect(new Set(Object.values(theme.imagery!)).size).toBe(3)
 expect(new Set(config.themes.map(theme=>theme.imagery!.background)).size).toBe(2)
 expect(config.themes.map(theme=>theme.name)).toEqual(['Postcapitalist Corporate','AnkhTech'])
 for(const url of ['javascript:alert(1)','data:image/svg+xml,bad','https://user:password@example.org/a.png','//example.org/a.png']){
  expect(parseOrganizationThemes({...config,themes:[{...config.themes[0],imagery:{...config.themes[0].imagery,icon:url}}]})).toBeNull()
 }
})

it('scopes saved organization themes to the organization panel in both color modes',async()=>{
 const {organizationPageTheme}=await import('./organizationThemes')
 const css=organizationPageTheme(site('one'))!
 expect(css).toContain('.portal-org-page[data-brand-theme]')
 expect(css).toContain('--primary:#123456')
 expect(css).toContain(':root[data-theme="dark"] .portal-org-page')
 expect(css).toContain('--primary:#ABCDEF')
 expect(organizationPageTheme(null)).toBeNull()
})


it('includes a complete Postcapitalist Corporate theme with accessible text in both modes and distinct imagery',async()=>{
 const {standardOrganizationThemes}=await import('../../../shared/organizationThemes')
 const {contrastRatio}=await import('../../../shared/brandContrast')
 const theme=standardOrganizationThemes.find(theme=>theme.id==='postcapitalist-corporate')!
 expect(theme.name).toBe('Postcapitalist Corporate')
 for(const mode of ['light','dark'] as const){
  const colors=theme[mode]
  expect(contrastRatio(colors['text-primary'],colors.surface)).toBeGreaterThanOrEqual(4.5)
  expect(contrastRatio(colors['text-secondary'],colors.surface)).toBeGreaterThanOrEqual(4.5)
  expect(contrastRatio(colors.primary,colors.surface)).toBeGreaterThanOrEqual(4.5)
  expect(contrastRatio(colors['on-primary'],colors.primary)).toBeGreaterThanOrEqual(4.5)
 }
 expect(new Set(Object.values(theme.imagery!)).size).toBe(3)
})


it('uses the configured organization avatar ahead of a stale directory image without changing host branding',async()=>{
 const {organizationPageAvatar}=await import('./organizationThemes')
 const branded={...site('company'),feature_config:{brandThemes:{defaultTheme:'company',themes:[{id:'company',name:'Company',light:{primary:'#123456'},dark:{primary:'#ABCDEF'},imagery:{avatar:'https://company.test/wordmark.png',icon:'https://company.test/icon.png',background:'https://company.test/cover.jpg'}}]}}}
 const host=site('host');setGroupSite(host)
 expect(organizationPageAvatar(branded,'https://lifetech.fyi/old-avatar.webp')).toBe('https://company.test/wordmark.png')
 expect(readOrganizationTheme()).toBe('ocean')
 expect(organizationPageAvatar(site('plain'),'https://company.test/profile.png')).toBe('https://company.test/profile.png')
 expect(organizationPageAvatar(null,null)).toBeNull()
})
