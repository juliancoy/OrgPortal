// These hosts serve their public homepage outside the portal's client router.
export function websiteHomeUrl(hostname = typeof window === 'undefined' ? '' : window.location.hostname): string | null {
  return ['techparty.us', 'www.techparty.us'].includes(hostname) ? '/' : null
}
