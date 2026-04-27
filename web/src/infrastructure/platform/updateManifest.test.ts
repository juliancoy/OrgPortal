import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtimePlatform = vi.hoisted(() => ({
  isNativeCapacitorRuntime: vi.fn<() => boolean>(() => false),
}))

vi.mock('./runtimePlatform', () => runtimePlatform)

import {
  checkForAvailableUpdate,
  performUpdateAction,
  resolveUpdateManifestUrl,
  type AvailableUpdate,
} from './updateManifest'

function setWindow(hostname: string, protocol = 'https:') {
  const open = vi.fn()
  const reload = vi.fn()
  const assign = vi.fn()
  vi.stubGlobal('window', {
    location: {
      hostname,
      protocol,
      reload,
      assign,
    },
    open,
  })
  return { open, reload, assign }
}

describe('updateManifest', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    runtimePlatform.isNativeCapacitorRuntime.mockReturnValue(false)
    ;(globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = '1.0.0'
    ;(globalThis as { __APP_BUILD_NUMBER__?: number }).__APP_BUILD_NUMBER__ = 10
  })

  it('resolves static manifest URL from portal host', () => {
    setWindow('dev.portal.arkavo.org')
    expect(resolveUpdateManifestUrl()).toBe('https://static.arkavo.org/mobile-update.json')
  })

  it('detects available web update when manifest build is newer', async () => {
    setWindow('dev.portal.arkavo.org')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          version: 1,
          publishedAt: '2026-04-27T00:00:00Z',
          web: {
            versionName: '1.1.0',
            buildNumber: 11,
            notes: 'New web update',
          },
        }),
      })),
    )

    const result = await checkForAvailableUpdate()
    expect(result.available?.target).toBe('web')
    expect(result.available?.latestBuildNumber).toBe(11)
    expect(result.available?.actionLabel).toBe('Reload app')
  })

  it('detects available native update using fallback runtime build info', async () => {
    setWindow('dev.portal.arkavo.org')
    runtimePlatform.isNativeCapacitorRuntime.mockReturnValue(true)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          version: 1,
          publishedAt: '2026-04-27T00:00:00Z',
          android: {
            versionName: '1.2.0',
            buildNumber: 12,
            apkUrl: 'https://static.arkavo.org/app-release.apk',
            notes: 'Native release',
            minSupportedBuildNumber: 11,
          },
        }),
      })),
    )

    const result = await checkForAvailableUpdate()
    expect(result.available?.target).toBe('native')
    expect(result.available?.mandatory).toBe(true)
    expect(result.available?.actionUrl).toBe('https://static.arkavo.org/app-release.apk')
  })

  it('performs web update action via reload', async () => {
    const { reload } = setWindow('dev.portal.arkavo.org')
    const update: AvailableUpdate = {
      target: 'web',
      current: { target: 'web', versionName: '1.0.0', buildNumber: 10 },
      latestVersionName: '1.1.0',
      latestBuildNumber: 11,
      notes: '',
      mandatory: false,
      actionLabel: 'Reload app',
      actionUrl: null,
    }

    await performUpdateAction(update)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('performs native update action with open fallback to assign', async () => {
    const { open, assign } = setWindow('dev.portal.arkavo.org')
    open.mockReturnValueOnce(null)
    const update: AvailableUpdate = {
      target: 'native',
      current: { target: 'native', versionName: '1.0.0', buildNumber: 10 },
      latestVersionName: '1.1.0',
      latestBuildNumber: 11,
      notes: '',
      mandatory: false,
      actionLabel: 'Download update',
      actionUrl: 'https://static.arkavo.org/app-release.apk',
    }

    await performUpdateAction(update)
    expect(open).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith('https://static.arkavo.org/app-release.apk')
  })
})

