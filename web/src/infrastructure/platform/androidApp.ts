const DEFAULT_APK_NAME = 'orgportal-android-release.apk'

export function resolveAndroidApkUrl() {
  if (typeof window === 'undefined') return `https://static.arkavo.org/${DEFAULT_APK_NAME}`
  const host = window.location.hostname.toLowerCase()
  const match = host.match(/^(?:dev\.)?portal\.(.+)$/)
  if (match?.[1]) return `https://static.${match[1]}/${DEFAULT_APK_NAME}`
  if (host === 'localhost' || host === '127.0.0.1') return `/${DEFAULT_APK_NAME}`
  return `https://static.arkavo.org/${DEFAULT_APK_NAME}`
}

export function isAndroidDevice() {
  if (typeof navigator === 'undefined') return false

  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  const platform = uaData?.platform?.toLowerCase() ?? ''
  if (platform.includes('android')) return true

  return /android/i.test(navigator.userAgent)
}
