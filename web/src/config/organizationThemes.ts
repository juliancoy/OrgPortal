import { parseOrganizationThemes } from '../../../shared/organizationThemes'
import { getGroupSite } from './timebankCommunity'

export function organizationThemes() {
  return parseOrganizationThemes(getGroupSite()?.feature_config?.brandThemes)
}

function storageKey() {
  const site = getGroupSite()
  return `orgportal.organization-theme.${site?.organization_id || site?.id || 'default'}`
}

export function readOrganizationTheme(): string {
  const config = organizationThemes()
  if (!config) return ''
  try {
    const id = localStorage.getItem(storageKey())
    if (config.themes.some(theme => theme.id === id)) return id!
  } catch { /* Storage may be unavailable. */ }
  return config.defaultTheme
}

export function applyOrganizationTheme(id = readOrganizationTheme()) {
  const config = organizationThemes()
  const theme = config?.themes.find(theme => theme.id === id) || config?.themes.find(theme => theme.id === config.defaultTheme)
  let style = document.getElementById('organization-theme-colors')
  if (!theme) {
    style?.remove()
    delete document.documentElement.dataset.organizationTheme
    return
  }
  if (!style) {
    style = document.createElement('style')
    style.id = 'organization-theme-colors'
    document.head.appendChild(style)
  }
  // Extra root specificity overrides built-in tenant palettes in both modes.
  const root = ':root:root:root[data-organization-theme]'
  const declarations = (colors: Record<string, string>) => Object.entries(colors).map(([token, color]) => `--${token}:${color};`).join('')
  style.textContent = `${root}{${declarations(theme.light)}}\n${root}[data-theme="dark"]{${declarations(theme.dark)}}\n@media(prefers-color-scheme:dark){${root}:not([data-theme]){${declarations(theme.dark)}}}`
  document.documentElement.dataset.organizationTheme = theme.id
}

export function selectOrganizationTheme(id: string) {
  if (!organizationThemes()?.themes.some(theme => theme.id === id)) return
  try { localStorage.setItem(storageKey(), id) } catch { /* Apply even without storage. */ }
  applyOrganizationTheme(id)
}
