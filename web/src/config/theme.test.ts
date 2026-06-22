import { describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY, applyThemeMode, normalizeThemeMode, readThemeMode } from './theme'

describe('theme settings', () => {
  it('defaults unknown stored values to system', () => {
    expect(normalizeThemeMode(null)).toBe('system')
    expect(normalizeThemeMode('system')).toBe('system')
    expect(normalizeThemeMode('unexpected')).toBe('system')
    expect(normalizeThemeMode('light')).toBe('light')
    expect(normalizeThemeMode('dark')).toBe('dark')
  })

  it('reads and applies the selected theme', () => {
    const getItem = vi.fn(() => 'system')
    expect(readThemeMode({ getItem })).toBe('system')
    expect(getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY)

    const setItem = vi.fn()
    applyThemeMode('system', { setItem })

    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'system')
  })
})
