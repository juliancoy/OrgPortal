import { pidpUrl } from './pidp'

/** Keep stored avatar keys usable after the first-party identity domain move. */
export function resolveAvatarUrl(raw: string): string {
  try {
    const url = new URL(raw)
    if (['https:', 'http:'].includes(url.protocol) &&
        ['id.codecollective.us', 'id.orgportal.cc'].includes(url.hostname) &&
        !url.username && !url.password && url.pathname.startsWith('/avatars/')) {
      return pidpUrl(url.pathname + url.search + url.hash)
    }
  } catch { /* Relative paths and non-URL values retain their existing handling. */ }
  return raw
}
