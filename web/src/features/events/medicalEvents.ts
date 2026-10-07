type MedicalEventCandidate = {
  name?: string | null; title?: string | null; description?: string | null
  source_group?: string | null; org_name?: string | null; orgName?: string | null
  organization_name?: string | null; host_org_name?: string | null
  source?: string | null; url?: string | null; public_url?: string | null
  host_org_id?: string | null; medtechOwned?: boolean; tags?: unknown
}
const medicalTerms = /\b(medtech|medical|medicine|healthcare|health care|digital health|public health|mental health|biotech(?:nology)?|biopharma|pharma(?:ceutical)?|clinical|clinic|hospital|patients?|therapeutics?|life sciences?|genomics?|sequencing|cancer|oncology|nursing|physicians?|diagnos(?:is|tic|tics)|disease|vaccines?|surgery|surgical|neuroscience|cardiology|dental|pharmacology|biomedical)\b/i
const medicalTags = /^(medtech|medical|medicine|healthcare|health care|biotech(?:nology)?|life sciences?|clinical|mental health|public health)$/i
const wellnessOnly = /\b(yoga|meditation|fitness|pilates|workout|dance|hiking)\b/i
const medicalOrganizers = /\b(nami|bio-?trac|biobuzz|nih|national cancer institute|university of maryland medical)\b/i

export function isLifeTechMedicalEvent(event: MedicalEventCandidate) {
  if (event.medtechOwned || ['org-baltimore-medtech', 'ef646755-9443-4c7b-ba4b-a7a29754f666'].includes(event.host_org_id || '')) return true
  const title = String(event.name || event.title || '')
  const organizers = [event.source_group, event.org_name, event.orgName, event.organization_name, event.host_org_name, event.source].filter(Boolean).join(' ')
  const text = `${title} ${String(event.description || '').replace(/<[^>]*>/g, ' ')} ${organizers}`
  const tags = Array.isArray(event.tags) ? event.tags.map(tag => String(tag).trim()) : []
  if (/\blife\s*tech\b/i.test(title) || medicalTerms.test(text) || medicalOrganizers.test(organizers) || tags.some(tag => medicalTags.test(tag))) return true
  // A broad health tag alone also labels exercise and leisure in the regional feed.
  return tags.some(tag => /^health$/i.test(tag)) && !wellnessOnly.test(text)
}

export function eventCalendarDateKey(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type: string) => parts.find(part => part.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
