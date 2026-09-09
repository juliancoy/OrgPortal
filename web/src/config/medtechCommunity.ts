export const MEDTECH_EVENTS_URL = 'https://codecollective.us/baltimore/upcoming_events.json'
export const MEDTECH_CHAT_URL = 'https://chat.whatsapp.com/Fpsd3Ko6l7q0Fy8DEYxw8V'

export type MedTechEvent = {
  name: string
  startDate: string
  url: string
  location?: { name?: string }
  imageUrl?: string
  orgImageUrl?: string
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
