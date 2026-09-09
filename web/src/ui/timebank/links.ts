import { timebankHomePath } from '../../config/timebankCommunity'

export function timebankListingPath(id: string) { return `${timebankHomePath()}?listing=${encodeURIComponent(id)}` }
export function timebankMessagePath(userId: string, name: string, listingId: string) {
  return `/chat?${new URLSearchParams({ start: 'dm', userId, name, timebankListing: listingId })}`
}
// Notification destinations are app routes, never arbitrary redirects.
export function timebankNoticePath(path: string) {
  if (!path.startsWith('/timebanking?') || path.includes('\\') || /[\r\n]/.test(path)) return `${timebankHomePath()}?tab=notifications`
  return path.replace('/timebanking', timebankHomePath())
}
