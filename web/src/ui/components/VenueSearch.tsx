import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Venue } from './EventVenues'

export function VenueSearch() {
  const id = useId()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Venue[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const search = query.trim()

  useEffect(() => {
    const controller = new AbortController()
    setResults([]); setError(''); setLoading(!!search)
    if (!search) return () => controller.abort()
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/org/api/network/venues/public?q=${encodeURIComponent(search)}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Unable to search venues. Please try again.')
        const venues = await response.json() as Venue[]
        if (!controller.signal.aborted) setResults(venues.filter(venue => venue.status === 'active'))
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Unable to search venues.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [search])

  return <div className="venue-search">
    <form role="search" aria-label="Venue directory" onSubmit={event => event.preventDefault()}>
      <label htmlFor={`${id}-query`}>Search venues</label>
      <input id={`${id}-query`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by venue name or address…" aria-controls={`${id}-results`} />
    </form>
    {search ? <div id={`${id}-results`} aria-busy={loading}>
      <p className="muted" role="status">{loading ? 'Searching venues…' : error || (results.length ? `${results.length} ${results.length === 1 ? 'venue' : 'venues'} found` : `No venues match “${search}”.`)}</p>
      {results.length ? <ul className="venue-search-results">
        {results.map(venue => <li key={venue.id}>
          <Link to={`/orgs/events/venues/${encodeURIComponent(venue.id)}`}><strong>{venue.name}</strong>{venue.address ? <span>{venue.address}</span> : null}</Link>
        </li>)}
      </ul> : null}
    </div> : <div id={`${id}-results`} />}
  </div>
}
