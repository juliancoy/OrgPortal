import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowBigDown, ArrowBigUp } from 'lucide-react'
import { useAuth } from '../../app/AppProviders'
import type { Venue } from './EventVenues'

type VoteVenue = Venue & { upvotes: number; downvotes: number; score: number }
type Summary = { closed: boolean; venues: VoteVenue[] }

export function VenueVotes({ eventId, venues }: { eventId: string; venues: Venue[] }) {
  const { token } = useAuth()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [votes, setVotes] = useState<Record<string, number>>({})
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [retry, setRetry] = useState(0)
  const generation = useRef(0)
  const base = `/api/org/api/network/events/${encodeURIComponent(eventId)}/venue-votes`

  useEffect(() => {
    const controller = new AbortController()
    generation.current += 1
    setSummary(null); setVotes({}); setReady(false); setPending(null); setMessage('')
    async function load() {
      try {
        const response = await fetch(`${base}/public`, { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('Unable to load venue vote totals.')
        const data = await response.json() as Summary
        if (controller.signal.aborted) return
        setSummary(data)
        if (token) {
          const ownResponse = await fetch(base, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' })
          if (!ownResponse.ok) throw new Error('Unable to load your saved votes. Please retry or sign in again.')
          const own = await ownResponse.json() as { votes: Record<string, number> }
          if (controller.signal.aborted) return
          setVotes(own.votes)
        }
        setReady(true)
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Unable to load votes.')
      }
    }
    void load()
    return () => { controller.abort(); generation.current += 1 }
  }, [base, token, venues, retry])

  async function vote(venue: Venue, direction: number) {
    if (!token || !ready || pending || summary?.closed) return
    const currentGeneration = generation.current
    const value = votes[venue.id] === direction ? 0 : direction
    setPending(venue.id); setMessage('')
    try {
      const response = await fetch(`${base}/${encodeURIComponent(venue.id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value }), signal: AbortSignal.timeout(15000),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.message || data.error || 'Unable to save your vote. Retry to check your saved votes.')
      if (currentGeneration !== generation.current) return
      setSummary(data)
      setVotes(previous => ({ ...previous, [venue.id]: data.my_vote }))
      setMessage(value === 0 ? `Your vote for ${venue.name} was cleared.` : `Your ${value === 1 ? 'upvote' : 'downvote'} for ${venue.name} is saved.`)
    } catch (error) {
      if (currentGeneration === generation.current) {
        setReady(false)
        setMessage(error instanceof Error ? error.message : 'Unable to save your vote. Reload your saved votes before trying again.')
      }
    } finally { if (currentGeneration === generation.current) setPending(null) }
  }

  if (!venues.length) return <p>Venue to be confirmed.</p>
  const closed = summary?.closed || venues.some(venue => venue.event_status === 'confirmed')
  // Keep rows in place while voting so focus and touch targets do not jump.
  return <div className="venue-voting">
    <p className="muted">{closed ? 'A venue is confirmed. Voting is closed.' : 'Vote on each candidate. Select the same arrow again to clear your vote. You can change votes until a venue is confirmed.'}</p>
    {!token && !closed ? <p><Link to={`/users/login?next=${encodeURIComponent(location.pathname)}`}>Sign in to vote</Link>. Community totals are public; individual votes are private.</p> : null}
    <ul className="venue-vote-list" aria-label="Event venues and community votes">
      {venues.map(venue => {
        const totals = summary?.venues.find(item => item.id === venue.id)
        const own = ready ? votes[venue.id] || 0 : 0
        const disabled = !token || !ready || !!pending || closed
        const initials = venue.name.split(/\s+/).slice(0, 2).map(word => word[0]).join('')
        return <li className="venue-vote-row" key={venue.id}>
          <div className="venue-vote-controls" aria-label={`Votes for ${venue.name}`}>
            <button type="button" aria-label={`Upvote ${venue.name}`} aria-pressed={own === 1} disabled={disabled} className="venue-upvote" onClick={() => void vote(venue, 1)}><ArrowBigUp size={24} aria-hidden="true" /></button>
            <strong className="venue-vote-score" aria-label={totals ? `Score ${totals.score}` : 'Score loading'}>{totals ? totals.score : '—'}</strong>
            <button type="button" aria-label={`Downvote ${venue.name}`} aria-pressed={own === -1} disabled={disabled} className="venue-downvote" onClick={() => void vote(venue, -1)}><ArrowBigDown size={24} aria-hidden="true" /></button>
          </div>
          <div className="venue-hover-card">
          <Link className="venue-vote-avatar" to={`/orgs/events/venues/${encodeURIComponent(venue.id)}`} aria-label={`View ${venue.name}`} aria-describedby={`venue-details-${venue.id}`}>
            <span aria-hidden="true">{initials}</span>
            {venue.image_url ? <img src={venue.image_url} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none' }} /> : null}
          </Link>
          <div className="venue-hover-popup" id={`venue-details-${venue.id}`} role="tooltip">
            <strong>{venue.name}</strong>
            {venue.address ? <p>{venue.address}</p> : null}
            {venue.description ? <p>{venue.description}</p> : null}
            {venue.opening_hours ? <p><b>Hours:</b> {venue.opening_hours}</p> : null}
            {venue.amenities ? <p><b>Amenities:</b> {venue.amenities}</p> : null}
            {venue.capacity ? <p><b>Capacity:</b> {venue.capacity}</p> : null}
            {venue.cost ? <p><b>Cost:</b> {venue.cost}</p> : null}
            {venue.website ? <p>{venue.website}</p> : null}
          </div>
          </div>
          <div className="venue-vote-details">
            <div className="venue-vote-title"><h3><Link to={`/orgs/events/venues/${encodeURIComponent(venue.id)}`}>{venue.name}</Link></h3><span className="venue-vote-status">{venue.event_status === 'confirmed' ? 'Confirmed' : 'Candidate'}</span></div>
            {venue.address ? <p className="muted">{venue.address}</p> : null}
            <p className="venue-vote-totals">{totals ? `${totals.upvotes} upvotes · ${totals.downvotes} downvotes · ${totals.upvotes + totals.downvotes} total votes` : 'Loading vote totals…'}{pending === venue.id ? ' · Saving…' : own ? ` · You ${own === 1 ? 'upvoted' : 'downvoted'}` : ''}</p>
          </div>
        </li>
      })}
    </ul>
    {message ? <p role="status">{message}</p> : null}
    {!ready && message ? <button type="button" onClick={() => setRetry(value => value + 1)}>Reload votes</button> : null}
  </div>
}
