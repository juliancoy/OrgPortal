import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Venue } from './EventVenues'

type HistoricalEvent = { id: string; starts_at?: string | null; ends_at?: string | null; event_date?: string | null; location?: string | null; venues?: Venue[] }
export function commonGroupVenues(events: HistoricalEvent[], eventId: string, now = Date.now()) {
  const counts = new Map<string, { name: string; venueId?: string; count: number }>()
  for (const event of events) {
    if (event.id === eventId || !(Date.parse(event.ends_at || event.starts_at || event.event_date || '') < now)) continue
    const venue = event.venues?.find(item => item.event_status === 'confirmed')
    const name = (venue?.name || event.location || '').trim()
    if (!name || /^(tbd|tba|to be confirmed|venue to be confirmed|online|virtual)$/i.test(name)) continue
    const key = name.toLocaleLowerCase().replace(/\s+/g, ' ')
    const previous = counts.get(key)
    counts.set(key, { name, venueId: venue?.id || previous?.venueId, count: (previous?.count || 0) + 1 })
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 10)
}

export function GroupVenueHistory({ organizationSlug, eventId }: { organizationSlug: string; eventId: string }) {
  const [events, setEvents] = useState<HistoricalEvent[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setEvents([]); setError('')
    fetch(`/api/org/api/network/orgs/public/${encodeURIComponent(organizationSlug)}/events?hosted_only=true&upcoming_only=false&limit=200`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Unable to load this group’s past venues.'); return response.json() })
      .then(setEvents).catch(failure => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [organizationSlug])
  const venues = commonGroupVenues(events, eventId)
  return <div>
    <h3>Common venues for this group</h3>
    <p className="muted">From the group’s most recent 200 events, most frequently used first.</p>
    {error ? <p role="status">{error}</p> : venues.length ? <ul>{venues.map(venue => <li key={venue.name}>
      {venue.venueId ? <Link to={`/orgs/events/venues/${encodeURIComponent(venue.venueId)}`}>{venue.name}</Link> : venue.name}
      {' · '}{venue.count} past {venue.count === 1 ? 'event' : 'events'}
    </li>)}</ul> : <p className="muted">No past venues found.</p>}
  </div>
}
