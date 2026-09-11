export const MEDICAL_EVENTS_SOURCE_URL = 'https://codecollective.us/baltimore/upcoming_events.json'
export const MEDTECH_ORG_EVENTS_SOURCE_URL = '/api/org/api/network/orgs/public/baltimore-medtech/events?upcoming_only=true&limit=120'
export const MEDTECH_EVENTS_URL = 'https://medtech.social/medtech-events'

export function medtechEventUrl(event) {
  const slug = typeof event.slug === 'string' ? event.slug.trim() : typeof event.portalSlug === 'string' ? event.portalSlug.trim() : ''
  if (slug) return `https://medtech.social/events/${encodeURIComponent(slug)}`
  if (typeof event.public_url === 'string' && event.public_url.trim()) {
    try {
      const url = new URL(event.public_url)
      if (url.pathname.startsWith('/p/events/')) {
        return `https://medtech.social${url.pathname.slice('/p'.length)}${url.search}${url.hash}`
      }
      if (url.pathname.startsWith('/events/')) {
        return `https://medtech.social${url.pathname}${url.search}${url.hash}`
      }
      if (['https:', 'http:'].includes(url.protocol)) return url.href
    } catch { /* Fall back to the MedTech events page. */ }
  }
  return MEDTECH_EVENTS_URL
}

export function eventImageUrl(event) {
  for (const value of [event.imageUrl, event.orgImageUrl]) {
    if (typeof value !== 'string' || !value.trim()) continue
    try {
      const url = new URL(value, MEDICAL_EVENTS_SOURCE_URL)
      if (['https:', 'http:'].includes(url.protocol)) return url.href
    } catch { /* Try the organizer image if the event image is invalid. */ }
  }
  return null
}

const medicalSourceHints = [
  'nami',
  'bio-trac',
  'biotrac',
  'biobuzz',
  'mdtechcouncil',
  'johns hopkins',
  'hopkins',
  'nih',
  'national cancer institute',
  'university of maryland medical',
]

const medicalKeywords = /\b(medtech|medical|medicine|healthcare|health care|public health|mental health|biotech|biopharma|pharma(?:ceutical)?|clinical|clinic|hospital|patient|therapeutics?|life sciences?|genomics?|sequencing|cancer|oncology|nursing|physician|diagnos(?:is|tic|tics)?|disease|vaccine|surgery|surgical|neuroscience|cardiology|dental|pharmacology)\b/i
const wellnessOnly = /\b(yoga|meditation|fitness|pilates|dance fitness|line dancing|workout)\b/i

function searchableText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ')
}

function eventBlob(event) {
  return [
    event.name,
    event.description,
    event.source_group,
    event.org_name,
    event.orgName,
    event.location?.name,
    event.location?.address,
    event.url,
    event.source,
  ].map(searchableText).join(' ')
}

export function isMedTechOwnedEvent(event) {
  if (event?.medtechOwned === true) return true
  const tags = Array.isArray(event?.tags) ? event.tags.map((tag) => String(tag).toLowerCase()) : []
  const blob = eventBlob(event).toLowerCase()
  return tags.includes('medtech')
    || event?.host_org_id === 'org-baltimore-medtech'
    || /(^|\b)baltimore medtech(\b|$)/i.test(blob)
    || /medtech\.social\/(?:p\/)?events\//.test(String(event?.url || event?.public_url || ''))
}

export function isMedicalEvent(event) {
  if (isMedTechOwnedEvent(event)) return true
  const tags = Array.isArray(event.tags) ? event.tags.map((tag) => String(tag).toLowerCase()) : []
  const blob = eventBlob(event)
  const normalizedBlob = blob.toLowerCase()
  const sourceMatch = medicalSourceHints.some((hint) => normalizedBlob.includes(hint))
  const keywordMatch = medicalKeywords.test(blob)
  const taggedHealth = tags.includes('health')

  if (sourceMatch || keywordMatch) return true
  if (taggedHealth && !wellnessOnly.test(blob)) return true
  return false
}

export function normalizeMedTechPortalEvent(event) {
  const location = typeof event.location === 'string' ? event.location.trim() : ''
  const organizationName = event.organization_name || event.host_org_name || 'Baltimore MedTech'
  return {
    name: event.title || event.name || 'Baltimore MedTech event',
    description: event.description || '',
    startDate: event.starts_at || event.startDate || '',
    endTime: event.ends_at || event.endTime || '',
    url: medtechEventUrl(event),
    status: 'ACTIVE',
    location: {
      name: location,
      address: location,
      city: 'Baltimore',
      state: 'MD',
      country: 'US',
    },
    imageUrl: event.image_url || event.imageUrl || '',
    orgImageUrl: event.orgImageUrl || '',
    tags: Array.isArray(event.tags) ? [...new Set(['medtech', ...event.tags])] : ['medtech'],
    source: MEDTECH_EVENTS_URL,
    source_url: MEDTECH_EVENTS_URL,
    source_group: organizationName,
    org_name: organizationName,
    orgName: organizationName,
    medtechOwned: true,
    portalEventId: event.id || null,
    portalSlug: event.slug || null,
    slug: event.slug || null,
  }
}

export function mergeEventSources(...sources) {
  const seen = new Set()
  const merged = []
  for (const events of sources) {
    if (!Array.isArray(events)) continue
    for (const event of events) {
      const dateKey = String(event.startDate || event.starts_at || '').slice(0, 19)
      const nameKey = String(event.name || event.title || '').trim().toLowerCase()
      const urlKey = String(event.url || event.public_url || '').trim().toLowerCase()
      const key = urlKey || `${nameKey}|${dateKey}`
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push(event)
    }
  }
  return merged
}

export function parseEventDate(event) {
  const date = new Date(event.startDate)
  return Number.isNaN(date.getTime()) ? null : date
}

export function eventCoordinates(event) {
  const rawLatitude = event.location?.latitude
  const rawLongitude = event.location?.longitude
  if (rawLatitude === '' || rawLongitude === '' || rawLatitude === null || rawLongitude === null) return null
  if (rawLatitude === undefined || rawLongitude === undefined) return null

  const latitude = Number(rawLatitude)
  const longitude = Number(rawLongitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  return [longitude, latitude]
}
