import { useEffect, useMemo, useState } from 'react'
import { getDomainTenant } from '../../../config/timebankCommunity'
import { setSeoMeta, upsertJsonLd } from '../../utils/seo'

const MEDICAL_EVENTS_SOURCE_URL = 'https://codecollective.us/baltimore/upcoming_events.json'
const EVENT_TIME_ZONE = 'America/New_York'
const ORG_API_BASE = '/api/org'

type RegionalEvent = {
  name?: string | null
  title?: string | null
  description?: string | null
  startDate?: string | null
  event_date?: string | null
  starts_at?: string | null
  endTime?: string | null
  ends_at?: string | null
  url?: string | null
  public_url?: string | null
  source_group?: string | null
  org_name?: string | null
  orgName?: string | null
  source?: string | null
  imageUrl?: string | null
  image_url?: string | null
  orgImageUrl?: string | null
  host_org_id?: string | null
  tags?: unknown
  slug?: string | null
  portalSlug?: string | null
  location?: string | { name?: string | null; address?: string | null; city?: string | null; state?: string | null } | null
  medtechOwned?: boolean
}

type CalendarEvent = {
  id: string
  title: string
  description: string
  startsAt: string
  endsAt?: string | null
  date: Date
  url: string
  imageUrl: string
  source: string
  location: string
  medtechOwned: boolean
  dateOnly: boolean
}

function orgUrl(path: string) {
  return path.startsWith('/') ? `${ORG_API_BASE}${path}` : `${ORG_API_BASE}/${path}`
}

function cleanText(value: unknown) {
  if (typeof document === 'undefined') return String(value || '').replace(/<[^>]*>/g, ' ')
  const div = document.createElement('div')
  div.innerHTML = String(value || '')
  return div.textContent || div.innerText || ''
}

function safeExternalUrl(value: unknown, fallback = '/events') {
  const raw = String(value || '').trim()
  if (!raw) return fallback
  try {
    const url = new URL(raw, window.location.origin)
    if (['http:', 'https:'].includes(url.protocol)) return url.href
  } catch {}
  return fallback
}

function eventDate(event: RegionalEvent) {
  const value = event.startDate || event.starts_at || event.event_date || ''
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value)
  return Number.isNaN(date.getTime()) ? null : date
}

function locationText(event: RegionalEvent) {
  if (typeof event.location === 'string') return event.location.trim()
  if (event.location && typeof event.location === 'object') {
    return [event.location.name, event.location.address, event.location.city, event.location.state]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .filter((part, index, parts) => !parts.slice(0, index).some((previous) => previous === part || previous.includes(part)))
      .join(', ')
  }
  return ''
}

function medtechEventUrl(event: RegionalEvent) {
  const slug = String(event.slug || event.portalSlug || '').trim()
  if (slug) return `/events/${encodeURIComponent(slug)}`
  const publicUrl = String(event.public_url || '').trim()
  if (publicUrl) {
    try {
      const url = new URL(publicUrl, window.location.origin)
      if (url.pathname.startsWith('/p/events/')) return `${url.origin}${url.pathname.slice('/p'.length)}${url.search}${url.hash}`
      if (url.pathname.startsWith('/events/')) return `${url.origin}${url.pathname}${url.search}${url.hash}`
    } catch {}
  }
  return '/org-events'
}

function imageUrl(event: RegionalEvent) {
  for (const value of [event.image_url, event.imageUrl, event.orgImageUrl]) {
    const raw = String(value || '').trim()
    if (!raw) continue
    try {
      const url = new URL(raw, window.location.origin)
      if (['http:', 'https:'].includes(url.protocol)) return url.href
    } catch {}
  }
  return ''
}

function isMedTechOwnedEvent(event: RegionalEvent) {
  return event.medtechOwned === true || ['org-baltimore-medtech', 'ef646755-9443-4c7b-ba4b-a7a29754f666'].includes(event.host_org_id || '') || /(?:lifetech\.fyi|medtech\.social)\/events\//.test(event.url || event.public_url || '')
}

function normalizePortalEvent(event: RegionalEvent): RegionalEvent {
  const organizationName = String(event.org_name || event.orgName || event.source_group || 'LifeTech community')
  return {
    ...event,
    name: event.title || event.name || 'Baltimore MedTech event',
    startDate: event.starts_at || event.startDate || event.event_date || '',
    endTime: event.ends_at || event.endTime || '',
    url: medtechEventUrl(event),
    source_group: organizationName,
    org_name: organizationName,
    medtechOwned: true,
    tags: Array.isArray(event.tags) ? ['medtech', ...event.tags.map(String)] : ['medtech'],
  }
}

function mergeEventSources(...sources: RegionalEvent[][]) {
  const seen = new Set<string>()
  const merged: RegionalEvent[] = []
  for (const events of sources) {
    for (const event of Array.isArray(events) ? events : []) {
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

function normalizeCalendarEvent(event: RegionalEvent, index: number): CalendarEvent | null {
  const date = eventDate(event)
  if (!date) return null
  const medtechOwned = isMedTechOwnedEvent(event)
  const title = cleanText(event.name || event.title || 'Community event').trim()
  return {
    id: `${String(event.url || event.public_url || title)}-${index}`,
    title,
    description: cleanText(event.description || '').replace(/\s+/g, ' ').trim(),
    startsAt: event.startDate || event.starts_at || event.event_date || '',
    dateOnly: !event.starts_at && !event.startDate?.includes('T'),
    endsAt: event.endTime || event.ends_at || null,
    date,
    url: medtechOwned ? medtechEventUrl(event) : safeExternalUrl(event.url || event.public_url),
    imageUrl: imageUrl(event),
    source: cleanText(event.source_group || event.org_name || event.orgName || '').trim(),
    location: locationText(event),
    medtechOwned,
  }
}

function formatEventTime(date: Date) {
  return date.toLocaleString(undefined, { timeZone: EVENT_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function PublicCalendarPage() {
  const tenant = getDomainTenant()
  const organizationSlug = tenant?.home_org_slug || 'baltimore-medtech'
  const organizationPaths = [...new Set([organizationSlug, 'baltimore-medtech', ...(organizationSlug === 'lifetech' || organizationSlug === 'baltimore-medtech' ? ['lifetech'] : [])])].map(slug => `/api/network/orgs/public/${encodeURIComponent(slug)}/events?upcoming_only=false&limit=200`)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [visibleDate, setVisibleDate] = useState(() => new Date())
  const [status, setStatus] = useState('Loading medical events…')

  useEffect(() => {
    setSeoMeta({
      title: 'Events • LifeTech',
      description: 'Medical, health, biotech, and Baltimore MedTech-hosted events around the region.',
      canonicalUrl: `${window.location.origin}/calendar`,
      type: 'website',
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    setStatus('Loading medical events…')
    Promise.allSettled([
      fetch(MEDICAL_EVENTS_SOURCE_URL, { cache: 'no-store' }).then((response) => { if (!response.ok) throw new Error('Regional source unavailable'); return response.json() }),
      ...organizationPaths.map(path => fetch(orgUrl(path), { cache: 'no-store' }).then((response) => { if (!response.ok) throw new Error('Organization source unavailable'); return response.json() })),
    ])
      .then(([regionalResult, ...organizationResults]) => {
        const regional = regionalResult.status === 'fulfilled' ? regionalResult.value : []
        const medtech = organizationResults.flatMap(result => result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : [])
        if (cancelled) return
        const medtechEvents = Array.isArray(medtech) ? medtech.map(normalizePortalEvent) : []
        const regionalEvents = Array.isArray(regional) ? regional : []
        const nextEvents = mergeEventSources(medtechEvents, regionalEvents)
          .map(normalizeCalendarEvent)
          .filter((event): event is CalendarEvent => Boolean(event))
          .sort((a, b) => a.date.getTime() - b.date.getTime())
        setEvents(nextEvents)
        const firstUpcoming = nextEvents.find((event) => event.date >= new Date())
        if (firstUpcoming) setVisibleDate(new Date(firstUpcoming.date))
        setStatus([regionalResult, ...organizationResults].every((result) => result.status === 'rejected')
          ? 'The calendar is temporarily unavailable. Please try refreshing.'
          : [regionalResult, ...organizationResults].some((result) => result.status === 'rejected')
            ? 'Some event sources are unavailable. Showing events from the available sources.' : '')
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setStatus(reason instanceof Error ? reason.message : 'Unable to load the calendar.')
        setEvents([])
      })
    return () => { cancelled = true }
  }, [organizationSlug])

  const upcomingEvents = useMemo(() => {
    const now = new Date()
    const upcoming = events.filter((event) => event.date >= now)
    return upcoming

  }, [events])

  const monthDays = useMemo(() => {
    const monthStart = new Date(visibleDate.getFullYear(), visibleDate.getMonth(), 1)
    const firstGridDate = new Date(monthStart)
    firstGridDate.setDate(monthStart.getDate() - monthStart.getDay())
    const eventsByDay = new Map<string, CalendarEvent[]>()
    for (const event of events.filter((event) => monthKey(event.date) === monthKey(visibleDate))) {
      const key = dayKey(event.date)
      eventsByDay.set(key, [...(eventsByDay.get(key) || []), event])
    }
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(firstGridDate)
      date.setDate(firstGridDate.getDate() + index)
      return { date, events: eventsByDay.get(dayKey(date)) || [], inMonth: date.getMonth() === monthStart.getMonth() }
    })
  }, [events, visibleDate])

  const jsonLd = useMemo(() => ({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Baltimore MedTech General Calendar',
    itemListElement: upcomingEvents.slice(0, 50).map((event, index) => ({ '@type': 'ListItem', position: index + 1, name: event.title, url: new URL(event.url, window.location.origin).href })),
  }), [upcomingEvents])

  useEffect(() => {
    upsertJsonLd('medtech-general-calendar', jsonLd)
  }, [jsonLd])

  return <section className="public-calendar-page">
    <div className="public-events-heading public-calendar-heading">
      <h1>Events</h1>
    </div>

    {status ? <p className="muted" role="status">{status}</p> : null}

    <div className="community-events-columns">
      {[{ title: 'LifeTech events', owned: true }, { title: 'Partner events', owned: false }].map(column => {
        const now = new Date()
        const columnEvents = events.filter(event => event.medtechOwned === column.owned).sort((a, b) => {
          const aPast = (a.endsAt ? new Date(a.endsAt) : a.date) < now
          const bPast = (b.endsAt ? new Date(b.endsAt) : b.date) < now
          if (aPast !== bPast) return aPast ? 1 : -1
          return aPast ? b.date.getTime() - a.date.getTime() : a.date.getTime() - b.date.getTime()
        })
        return <section className="public-calendar-upcoming" key={column.title} aria-label={column.title}>
          <h2>{column.title}</h2>
          <p className="muted">{column.owned ? 'LifeTech and Baltimore MedTech group events, upcoming and past.' : 'Partner gatherings and the main regional events feed.'}</p>
          {!status && !columnEvents.length ? <p className="muted">No events listed.</p> : null}
          <div className="public-calendar-event-list">
        {columnEvents.map((event) => <article key={event.id} className={`portal-card public-calendar-event-card ${event.medtechOwned ? 'medtech-owned' : ''} ${event.imageUrl ? 'has-image' : ''}`}>
          <div className="public-calendar-event-date">
            {event.date.toLocaleDateString(undefined, { month: 'short' })}<span>{event.date.toLocaleDateString(undefined, { day: 'numeric' })}</span>
          </div>
          <div className="public-calendar-event-body">
            {event.medtechOwned ? <p className="public-calendar-feature-label">LifeTech community</p> : null}
            <h3><a href={event.url}>{event.title}</a></h3>
            <p className="muted">{[event.dateOnly ? `${event.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} • Time to be confirmed` : `${formatEventTime(event.date)}${event.endsAt ? `–${new Date(event.endsAt).toLocaleTimeString(undefined, { timeZone: EVENT_TIME_ZONE, hour: 'numeric', minute: '2-digit' })}` : ''} Eastern`, event.source, event.location].filter(Boolean).join(' • ')}</p>
            {event.description ? <p>{event.description.slice(0, 180)}{event.description.length > 180 ? '…' : ''}</p> : null}
            <a className="public-event-open-link" href={event.url}>{event.medtechOwned ? 'Register for this event' : 'Open event'}</a>
          </div>
          {event.imageUrl ? <a className="public-calendar-event-image" href={event.url} aria-label={`Open ${event.title}`}><img src={event.imageUrl} alt="" loading="lazy" decoding="async" /></a> : null}
        </article>)}
      </div>
    </section>
      })}
    </div>

    <section className="portal-card public-calendar-month" aria-labelledby="public-calendar-month-title">
      <div className="public-calendar-month-toolbar">
        <button type="button" onClick={() => setVisibleDate((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
        <h2 id="public-calendar-month-title">{visibleDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <button type="button" onClick={() => setVisibleDate((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))} aria-label="Next month">›</button>
      </div>
      <div className="public-calendar-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => <div key={label} className="public-calendar-weekday">{label}</div>)}
        {monthDays.map(({ date, events: dayEvents, inMonth }) => <div key={date.toISOString()} className={`public-calendar-day ${inMonth ? '' : 'outside'}`}>
          <span className="public-calendar-day-number">{date.getDate()}</span>
          {dayEvents.slice(0, 3).map((event) => <a key={event.id} className={`public-calendar-day-event ${event.medtechOwned ? 'medtech-owned' : ''}`} href={event.url}>{event.title}</a>)}
          {dayEvents.length > 3 ? <span className="public-calendar-day-more">+{dayEvents.length - 3} more</span> : null}
        </div>)}
      </div>
    </section>
  </section>
}
