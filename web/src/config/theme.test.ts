import { afterEach, describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY, applyThemeMode, normalizeThemeMode, readThemeMode } from './theme'

describe('theme settings', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('defaults to dark when storage is unavailable', () => {
    expect(readThemeMode({ getItem: () => { throw new Error('Unavailable') } })).toBe('dark')
  })

  it('defaults missing and unknown stored values to dark', () => {
    expect(normalizeThemeMode(null)).toBe('dark')
    expect(normalizeThemeMode('system')).toBe('system')
    expect(normalizeThemeMode('unexpected')).toBe('dark')
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
