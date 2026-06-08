import { describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY, applyThemeMode, normalizeThemeMode, readThemeMode } from './theme'

describe('theme settings', () => {
  it('defaults unknown stored values to dark', () => {
    expect(normalizeThemeMode(null)).toBe('dark')
    expect(normalizeThemeMode('system')).toBe('dark')
    expect(normalizeThemeMode('light')).toBe('light')
  })

  it('reads and applies the selected theme', () => {
    const getItem = vi.fn(() => 'light')
    expect(readThemeMode({ getItem })).toBe('light')
    expect(getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY)

    const setItem = vi.fn()
    applyThemeMode('dark', { setItem })

    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'dark')
  })
})
