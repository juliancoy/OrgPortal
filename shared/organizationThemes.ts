/** Color maps use CSS custom-property names without the leading --. */
export type OrganizationTheme = { id: string; name: string; light: Record<string, string>; dark: Record<string, string> }
export type OrganizationThemes = { defaultTheme: string; themes: OrganizationTheme[] }
export const THEME_ID = /^[a-z][a-z0-9-]{0,63}$/
export const THEME_COLOR_TOKEN = /^[a-z][a-z0-9-]{0,63}$/
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
