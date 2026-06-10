import { describe, expect, it, vi } from 'vitest'
import { isAndroidApkUrlReachable } from './androidApp'

describe('isAndroidApkUrlReachable', () => {
  it('returns true only when the APK URL responds successfully', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch')
    fetcher.mockResolvedValueOnce(new Response(null, { status: 200 }))
    fetcher.mockResolvedValueOnce(new Response(null, { status: 404 }))

    await expect(isAndroidApkUrlReachable('https://codecollective.us/p/orgportal-android-release.apk')).resolves.toBe(
      true,
    )
    await expect(isAndroidApkUrlReachable('https://codecollective.us/p/missing.apk')).resolves.toBe(false)

    expect(fetcher).toHaveBeenCalledWith(
      'https://codecollective.us/p/orgportal-android-release.apk',
      expect.objectContaining({ method: 'HEAD' }),
    )
    fetcher.mockRestore()
  })

  it('returns false for blank or failed URLs', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch')
    fetcher.mockRejectedValueOnce(new Error('network failed'))

    await expect(isAndroidApkUrlReachable('')).resolves.toBe(false)
    await expect(isAndroidApkUrlReachable('https://codecollective.us/p/orgportal-android-release.apk')).resolves.toBe(
      false,
    )

    expect(fetcher).toHaveBeenCalledTimes(1)
    fetcher.mockRestore()
  })
})
