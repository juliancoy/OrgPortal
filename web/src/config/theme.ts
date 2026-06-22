export type ThemeMode = 'system' | 'dark' | 'light'

export const THEME_STORAGE_KEY = 'orgportal.theme'

export function normalizeThemeMode(value: string | null | undefined): ThemeMode {
  if (value === 'dark' || value === 'light') return value
  return 'system'
}

export function readThemeMode(storage: Pick<Storage, 'getItem'> = localStorage): ThemeMode {
  return normalizeThemeMode(storage.getItem(THEME_STORAGE_KEY))
}

export function applyThemeMode(mode: ThemeMode, storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(THEME_STORAGE_KEY, mode)
  if (typeof document !== 'undefined') {
    if (mode === 'system') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', mode)
    }
  }
}
