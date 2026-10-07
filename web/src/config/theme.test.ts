import { afterEach, describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY, applyThemeMode, normalizeThemeMode, readThemeMode } from './theme'

import * as portalFeatures from './portalFeatures'

describe('theme settings', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('keeps LifeTech dark unless light is explicitly selected', () => {
    vi.spyOn(portalFeatures, 'getActivePortalProfileConfig').mockReturnValue({
      ...portalFeatures.getActivePortalProfileConfig(), id: 'lifetech',
    })
    const attributes = new Map<string, string>()
    vi.stubGlobal('document', { documentElement: {
      setAttribute: (key: string, value: string) => attributes.set(key, value),
      removeAttribute: (key: string) => attributes.delete(key),
    } })
    const storage = { setItem: vi.fn() }
    for (const saved of [null, 'system', 'unexpected', 'dark']) {
      expect(readThemeMode({ getItem: () => saved })).toBe('dark')
    }
    expect(readThemeMode({ getItem: () => { throw new Error('Unavailable') } })).toBe('dark')
    applyThemeMode('system', storage)
    expect(attributes.get('data-theme')).toBe('dark')
    applyThemeMode('light', storage)
    expect(attributes.get('data-theme')).toBe('light')
    expect(readThemeMode({ getItem: () => 'light' })).toBe('light')
  })

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
