export function isLinkedInInAppBrowser(userAgent = globalThis.navigator?.userAgent || ''): boolean {
  return /\bLinkedIn(App)?\b/i.test(userAgent)
}

export function isAndroidUserAgent(userAgent = globalThis.navigator?.userAgent || ''): boolean {
  return /Android/i.test(userAgent)
}

export function isIosUserAgent(userAgent = globalThis.navigator?.userAgent || ''): boolean {
  return /\b(iPhone|iPad|iPod)\b/i.test(userAgent)
}

export function externalBrowserUrl(href: string, userAgent = globalThis.navigator?.userAgent || ''): string {
  if (isAndroidUserAgent(userAgent)) {
    const url = new URL(href)
    const path = `${url.host}${url.pathname}${url.search}`
    return `intent://${path}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`
  }

  if (isIosUserAgent(userAgent)) {
    if (href.startsWith('https://')) return `googlechromes://${href.slice('https://'.length)}`
    if (href.startsWith('http://')) return `googlechrome://${href.slice('http://'.length)}`
  }

  return href
}
