import { getActivePortalProfileConfig } from './portalFeatures'

export type ThemeMode = 'system' | 'dark' | 'light'

export const THEME_STORAGE_KEY = 'orgportal.theme'
export const ACCOUNT_THEME_FIELD = 'theme_mode'

export function normalizeThemeMode(value: string | null | undefined): ThemeMode {
  if (value === 'dark' || value === 'light') return value
  return getActivePortalProfileConfig().id === 'lifetech' ? 'dark' : 'system'
}

export function accountThemeMode(value: unknown): ThemeMode | null {
  return value === 'dark' || value === 'light' || value === 'system' ? value : null
}

export function readThemeMode(storage: Pick<Storage, 'getItem'> = localStorage): ThemeMode {
  try {
    return normalizeThemeMode(storage.getItem(THEME_STORAGE_KEY))
  } catch {
    return normalizeThemeMode(null)
  }
}

export function applyThemeMode(mode: ThemeMode, storage: Pick<Storage, 'setItem'> = localStorage) {
  try {
    storage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // Storage can be unavailable in private or embedded contexts.
  }
  if (typeof document !== 'undefined') {
    if (mode === 'system' && getActivePortalProfileConfig().id === 'lifetech') {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else if (mode === 'system') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', mode)
    }
    document.documentElement.setAttribute('data-theme-mode', mode)
  }
}
