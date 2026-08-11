export type CalendarEvent = {
  title: string
  description?: string | null
  location?: string | null
  startsAt: string
  endsAt?: string | null
  url?: string | null
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function toUtcTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid calendar timestamp: ${value}`)
  return parsed.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function eventEnd(event: CalendarEvent): string {
  if (event.endsAt?.trim()) return event.endsAt
  const start = new Date(event.startsAt)
  if (Number.isNaN(start.getTime())) throw new Error(`Invalid calendar timestamp: ${event.startsAt}`)
  return new Date(start.getTime() + 60 * 60 * 1000).toISOString()
}

export function createIcsEvent(event: CalendarEvent): string {
  const details = [event.description?.trim() || '', event.url?.trim() || ''].filter(Boolean).join('\n\n')
  const nowStamp = toUtcTimestamp(new Date().toISOString())
  const uid = `${toUtcTimestamp(event.startsAt)}-${event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'event'}@codecollective.us`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Code Collective//Org Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeText(uid)}`,
    `DTSTAMP:${nowStamp}`,
    `DTSTART:${toUtcTimestamp(event.startsAt)}`,
    `DTEND:${toUtcTimestamp(eventEnd(event))}`,
    `SUMMARY:${escapeText(event.title.trim() || 'Event')}`,
  ]
  if (details) lines.push(`DESCRIPTION:${escapeText(details)}`)
  if (event.location?.trim()) lines.push(`LOCATION:${escapeText(event.location.trim())}`)
  if (event.url?.trim()) lines.push(`URL:${escapeText(event.url.trim())}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return `${lines.join('\r\n')}\r\n`
}

export function calendarFileName(name: string, fallback = 'event'): string {
  const slug = String(name || fallback)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `${slug || fallback}.ics`
}

export function downloadIcsEvent(event: CalendarEvent) {
  const blob = new Blob([createIcsEvent(event)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = calendarFileName(event.title)
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function formatOutlookDate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid calendar timestamp: ${value}`)
  return parsed.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function outlookCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title.trim() || 'Event',
    startdt: formatOutlookDate(event.startsAt),
    enddt: formatOutlookDate(eventEnd(event)),
  })
  const body = [event.description?.trim() || '', event.url?.trim() || ''].filter(Boolean).join('\n\n')
  if (body) params.set('body', body)
  if (event.location?.trim()) params.set('location', event.location.trim())
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`
}
