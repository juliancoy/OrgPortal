export const MEDTECH_EVENTS_URL = 'https://codecollective.us/baltimore/upcoming_events.json'
export const MEDTECH_CHAT_URL = 'https://chat.whatsapp.com/Fpsd3Ko6l7q0Fy8DEYxw8V'
export const MEDTECH_LUMA_URL = 'https://luma.com/baltimoremedtech'
export const MEDTECH_FORMATIONAL_EVENT = {
  name: 'MedTech Formational Event',
  plannedStart: '2026-09-29T22:00:00.000Z',
  plannedEnd: '2026-09-30T00:30:00.000Z',
  timezone: 'America/New_York',
  registrationUrl: MEDTECH_LUMA_URL,
} as const
// Public organization slug, not a search term or a client-side ownership grant.
export const MEDTECH_ORGANIZATION_SLUG = String(import.meta.env.VITE_MEDTECH_ORGANIZATION_SLUG || 'baltimore-medtech').trim()
export const MEDTECH_OWNED_EVENTS_PATH = `/api/network/orgs/public/${encodeURIComponent(MEDTECH_ORGANIZATION_SLUG)}/events?upcoming_only=true&limit=120`

export type MedTechEvent = {
  name: string
  startDate: string
  url: string
  location?: { name?: string }
  imageUrl?: string
  orgImageUrl?: string
}

// Only call this with the organization-scoped API response. Never substitute the
// general calendar feed when the organization is missing or its request fails.
export function selectOwnedMedTechEvents(feed: unknown, now = Date.now()): MedTechEvent[] {
  if (!Array.isArray(feed)) throw new Error('MedTech events are unavailable.')
  return feed.filter(event => event && typeof event.title === 'string' && typeof event.slug === 'string'
    && typeof event.starts_at === 'string' && Date.parse(event.starts_at) >= now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .slice(0, 3)
    .map(event => ({ name: event.title, startDate: event.starts_at,
      url: `/events/${encodeURIComponent(event.slug)}`, location: { name: event.location || '' },
      imageUrl: event.image_url || undefined }))
}

export function medTechEventImageUrl(event: MedTechEvent): string | null {
  for (const value of [event.imageUrl, event.orgImageUrl]) {
    if (typeof value !== 'string' || !value.trim()) continue
    try {
      const url = new URL(value, MEDTECH_EVENTS_URL)
      if (['https:', 'http:'].includes(url.protocol)) return url.href
    } catch { /* Try the organizer image if the event image is invalid. */ }
  }
  return null
}

export function selectMedTechEvents(feed: unknown, now = Date.now()): MedTechEvent[] {
  if (!Array.isArray(feed)) throw new Error('The event calendar is unavailable.')
  const medical = /\b(medtech|medical|medicine|healthcare|public health|mental health|biotech|biopharma|clinical|hospital|patient|life sciences?|genomics?|oncology|nursing|physician|pharma(?:ceutical)?|bio-trac|biotrac|biobuzz)\b/i
  return feed.filter((event): event is MedTechEvent => {
    if (!event || typeof event.name !== 'string' || typeof event.startDate !== 'string' || typeof event.url !== 'string') return false
    if (!/^https?:\/\//i.test(event.url) || !(Date.parse(event.startDate) >= now)) return false
    const text = [event.name, event.description, event.source_group, event.org_name, event.orgName, event.url].join(' ').replace(/<[^>]*>/g, ' ')
    return medical.test(text)
  }).sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate)).slice(0, 3)
}
