import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, ExternalLink } from 'lucide-react'
import type { Venue } from '../../components/EventVenues'

type PastEvent = { id: string; title: string; slug: string; starts_at?: string | null; event_date?: string | null; media?: { id: string; url: string; label: string; alt?: string; kind?: string }[] }
function dateLabel(event: PastEvent) {
  const value = event.starts_at || (event.event_date ? `${event.event_date}T12:00:00` : '')
  return value ? new Date(value).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : 'Date not recorded'
}
function mediaUrl(url: string) { return url.startsWith('/api/network/') ? `/api/org${url}` : url }
export function VenueProfile({ venue }: { venue: Venue }) {
  const [events, setEvents] = useState<PastEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setEvents([]); setLoading(true); setError('')
    fetch(`/api/org/api/network/venues/public/${encodeURIComponent(venue.id)}/events`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw Error('Past events are temporarily unavailable.'); return response.json() })
      .then(data => { if (!controller.signal.aborted) setEvents(data) })
      .catch(err => { if (!controller.signal.aborted) setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [venue.id])
  const mapQuery = encodeURIComponent([venue.name, venue.address].filter(Boolean).join(', '))
  const photos = events.flatMap(event => (event.media || []).filter(item => item.kind !== 'file' && !/logo|banner|poster|flyer|brand/i.test(item.label)).map(photo => ({ event, photo })))
  const facts = [['Hours', venue.opening_hours], ['Amenities', venue.amenities], ['Capacity', venue.capacity], ['Cost', venue.cost], ['Setting', venue.category ? venue.category[0].toUpperCase() + venue.category.slice(1) : null], ['Availability', venue.status === 'inactive' ? 'Inactive' : 'Active']] as const
  return <>
    <header className="venue-profile-header">
      <div className="venue-profile-mark">{venue.image_url ? <img src={venue.image_url} alt="" onError={event => { event.currentTarget.style.display='none' }} /> : <MapPin size={40}/>}</div>
      <div><p className="venue-eyebrow">Event venue</p><h1>{venue.name}</h1>{venue.address && <p className="venue-address"><MapPin size={17}/>{venue.address}</p>}
      <div className="venue-actions">{venue.website && <a className="btn-secondary" href={venue.website} target="_blank" rel="noreferrer">Visit website <ExternalLink size={15}/></a>}{venue.address && <a className="btn-secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`} target="_blank" rel="noreferrer">Get directions <ExternalLink size={15}/></a>}</div></div>
    </header>
    <div className="venue-profile-grid">
      <div className="venue-profile-main">
        <section className="portal-card venue-section"><h2>About the venue</h2><p>{venue.description || 'A description has not been added yet.'}</p>
          <dl className="venue-facts">{facts.filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          {venue.research_url && <p className="venue-source"><a href={venue.research_url} target="_blank" rel="noreferrer">Venue information source ↗</a>{venue.researched_at && ` · Reviewed ${venue.researched_at}`}</p>}
          {venue.image_source_url && <p className="venue-source"><a href={venue.image_source_url} target="_blank" rel="noreferrer">{venue.image_credit || 'Venue image source'} ↗</a></p>}
        </section>
        <section className="portal-card venue-section"><h2>Photos from past events</h2>
          {loading ? <p className="muted">Loading event photos…</p> : error ? <p role="status">{error}</p> : photos.length ? <div className="venue-photo-grid">{photos.map(({event,photo})=><figure key={`${event.id}-${photo.id}`}><a href={mediaUrl(photo.url)} target="_blank" rel="noreferrer"><img src={mediaUrl(photo.url)} alt={photo.alt || photo.label} loading="lazy"/></a><figcaption><Link to={`/events/${encodeURIComponent(event.slug)}`}>{event.title}</Link><span>{dateLabel(event)}</span></figcaption></figure>)}</div> : <p className="muted">No photos have been added to past events recorded at this venue yet.</p>}
        </section>
        <section className="portal-card venue-section"><h2>Past events</h2>{!loading && !error && !events.length ? <p className="muted">No past events are recorded at this venue yet.</p> : <ul className="venue-event-list">{events.map(event=><li key={event.id}><Link to={`/events/${encodeURIComponent(event.slug)}`}>{event.title}</Link><time>{dateLabel(event)}</time></li>)}</ul>}</section>
      </div>
      <aside className="portal-card venue-section venue-location"><h2>Location</h2>{venue.address ? <><p>{venue.address}</p><iframe title={`Map of ${venue.name}`} src={`https://www.google.com/maps?q=${mapQuery}&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade"/><a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noreferrer">Open map ↗</a></> : <p className="muted">An address is needed to show this venue on the map.</p>}</aside>
    </div>
  </>
}
