export type OrganizationThemeImagery = { icon: string; avatar: string; background: string }
export function isThemeImage(value: unknown): value is string {
 if(typeof value!=='string'||value.length>2048)return false
 if(/^\/images\/organization-themes\/[a-z0-9-]+\.(?:svg|webp)$/.test(value))return true
 try{const url=new URL(value);return (url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))&&!url.username&&!url.password}catch{return false}
}
/** Color maps use CSS custom-property names without the leading --. */
export type OrganizationTheme = { id: string; name: string; light: Record<string, string>; dark: Record<string, string>; imagery?: OrganizationThemeImagery }
export type OrganizationThemes = { defaultTheme: string; themes: OrganizationTheme[] }
export const THEME_ID = /^[a-z][a-z0-9-]{0,63}$/
export const THEME_COLOR_TOKEN = /^[a-zA-Z][a-zA-Z0-9-]{0,63}$/
export const THEME_COLOR = /^#[0-9a-f]{6}$/i

export function parseOrganizationThemes(value: unknown): OrganizationThemes | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const config = value as OrganizationThemes
  if (!Array.isArray(config.themes) || config.themes.length < 1 || config.themes.length > 24) return null
  const ids = new Set<string>()
  for (const theme of config.themes) {
    if (!theme || typeof theme !== 'object' || typeof theme.id !== 'string' || !THEME_ID.test(theme.id) || ids.has(theme.id)
      || typeof theme.name !== 'string' || !theme.name.trim() || theme.name.length > 80) return null
    ids.add(theme.id)
    if(theme.imagery!==undefined&&(!theme.imagery||typeof theme.imagery!=='object'||Array.isArray(theme.imagery)||!['icon','avatar','background'].every(key=>isThemeImage(theme.imagery![key as keyof OrganizationThemeImagery]))||Object.keys(theme.imagery).some(key=>!['icon','avatar','background'].includes(key))))return null
    for (const mode of ['light', 'dark'] as const) {
      const colors = theme[mode]
      if (!colors || typeof colors !== 'object' || Array.isArray(colors)) return null
      const entries = Object.entries(colors)
      if (!entries.length || entries.length > 128 || entries.some(([key, color]) => !THEME_COLOR_TOKEN.test(key) || typeof color !== 'string' || !THEME_COLOR.test(color))) return null
    }
    if (Object.keys(theme.light).some(key => !(key in theme.dark)) || Object.keys(theme.dark).some(key => !(key in theme.light))) return null
  }
  return typeof config.defaultTheme === 'string' && ids.has(config.defaultTheme) ? config : null
}

/** Keep component vocabulary aligned with the portal's core palette tokens. */
export function portalThemeColors(colors: Record<string, string>): Record<string, string> {
  const aliases: Record<string, string[]> = {
    surface: ['background', 'body-bg', 'bg-surface', 'surface-soft', 'soft', 'map-page-bg'],
    panel: ['paper', 'surface-solid', 'surface-raised', 'surface-input', 'header-bg', 'footer-bg', 'map-status-bg', 'button-secondary-bg'],
    'panel-2': ['surface-muted', 'surface-subtle', 'surface-strong', 'surface-softer', 'primary-bg', 'hero-bg', 'nav-active-bg', 'icon-tile-bg', 'calendar-head-bg', 'calendar-event-bg', 'date-bg'],
    'text-primary': ['text', 'ink', 'color-text-primary', 'calendar-event-ink'],
    'text-secondary': ['text-muted', 'muted', 'color-text-secondary', 'color-sage'],
    primary: ['primary-2', 'primary-hover', 'btn-primary-bg', 'action-bg', 'focus-color', 'icon-stroke', 'border-hover', 'blue', 'teal', 'brand-teal'],
    'on-primary': ['btn-primary-text', 'action-text', 'selection-text'],
    border: ['border-subtle', 'border-input', 'control-border', 'line', 'color-border'],
  }
  const result: Record<string, string> = {}
  for (const [token, targets] of Object.entries(aliases)) {
    if (colors[token]) for (const target of targets) result[target] = colors[token]
  }
  if (colors.primary) result['selection-bg'] = colors.primary
  if (colors.panel) result['paper-rgb'] = colors.panel.slice(1).match(/../g)!.map(hex => parseInt(hex, 16)).join(', ')
  return { ...result, ...colors }
}

const preset = (id:string,name:string):OrganizationTheme => ({
 id,name,
 light:{primary:'#155E59','on-primary':'#F4F5F0',surface:'#F4F5F0',panel:'#FFFFFF','panel-2':'#E5F2EE','text-primary':'#061A26','text-secondary':'#465D65',border:'#60817C','brand-gold':'#D4AF37','brand-teal':'#155E59','brand-offwhite':'#F4F5F0'},
 dark:{primary:'#7BDDCF','on-primary':'#061A26',surface:'#061A26',panel:'#0B2733','panel-2':'#123C43','text-primary':'#F4F5F0','text-secondary':'#AFC9CE',border:'#60817C','brand-gold':'#D4AF37','brand-teal':'#155E59','brand-offwhite':'#F4F5F0'},
 imagery:{icon:`/images/organization-themes/${id}-icon.webp`,avatar:`/images/organization-themes/${id}-avatar.webp`,background:`/images/organization-themes/${id}-background.webp`},
})
export const standardOrganizationThemes:OrganizationTheme[] = [
 preset('postcapitalist-corporate','Postcapitalist Corporate'),
 {...preset('ankhtech','AnkhTech'),light:{...preset('ankhtech','AnkhTech').light,panel:'#F4F5F0','panel-2':'#E0EEEA'},dark:{...preset('ankhtech','AnkhTech').dark,primary:'#D4AF37','panel-2':'#155E59'}},
]
