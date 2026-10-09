import { Link } from 'react-router-dom'
import { VenueVotes } from './VenueVotes'
import { useEffect, useState } from 'react'
import { VenueSearch } from './VenueSearch'
import { GroupVenueHistory } from './GroupVenueHistory'
import { useAuth } from '../../app/AppProviders'
export type Venue = {id:string;name:string;description?:string|null;image_url?:string|null;image_source_url?:string|null;image_credit?:string|null;research_url?:string|null;researched_at?:string|null;address?:string|null;website?:string|null;amenities?:string|null;capacity?:string|null;cost?:string|null;opening_hours?:string|null;status:string;category?:string;event_status?:string}
export function hasSetVenue(location?: string | null) {
 const value = location?.trim() || ''
 return !!value && !/^(tbd|tba|to be confirmed|venue to be confirmed|to be determined)$/i.test(value)
}
export function EventVenues({eventId,venues,canManage,onSaved,location,organizationSlug}:{eventId:string;venues:Venue[];canManage:boolean;location?:string|null;organizationSlug?:string|null;onSaved:(venues:Venue[])=>void}){
 const {token}=useAuth(),[catalog,setCatalog]=useState<Venue[]>([]),[selected,setSelected]=useState<string[]>(venues.map(v=>v.id)),[confirmed,setConfirmed]=useState(venues.find(v=>v.event_status==='confirmed')?.id||''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{setSelected(venues.map(v=>v.id));setConfirmed(venues.find(v=>v.event_status==='confirmed')?.id||'')},[venues])
 useEffect(()=>{if(canManage && !hasSetVenue(location) && !venues.some(v=>v.event_status==='confirmed'))fetch('/api/org/api/network/venues/public').then(r=>{if(!r.ok)throw new Error('Unable to load venues');return r.json()}).then(setCatalog).catch(e=>setMessage(e.message))},[canManage,location,venues])
 async function save(venueId: string | null = confirmed || null){if(!canManage||!token||busy)return;setBusy(true);setMessage('');try{const r=await fetch(`/api/org/api/network/events/${encodeURIComponent(eventId)}/venues`,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({candidate_venue_ids:selected,confirmed_venue_id:venueId})});if(!r.ok)throw new Error(await r.text());onSaved((await r.json()).venues);setMessage(venueId ? 'Venue confirmed.' : 'Candidate venues saved.')}catch(e){setMessage(e instanceof Error?e.message:'Unable to save venues')}finally{setBusy(false)}}
 const confirmedVenue = venues.find(venue => venue.event_status === 'confirmed')
 const choices = [...venues, ...catalog.filter(venue => !venues.some(existing => existing.id === venue.id))].filter(venue => selected.includes(venue.id) && venue.status === 'active')
 if (!confirmedVenue && (!canManage || hasSetVenue(location))) return null
 return <section className="portal-card" style={{display:'grid',gap:8}}>
  <h2>{confirmedVenue ? 'Event venue' : 'Event venues'}</h2>
  {confirmedVenue ? <Link className="venue-vote-title" to={`/orgs/events/venues/${encodeURIComponent(confirmedVenue.id)}`}>
   {confirmedVenue.image_url && <img src={confirmedVenue.image_url} alt="" style={{width:56,height:56,objectFit:'cover',borderRadius:8}}/>}
   <h3>{confirmedVenue.name}</h3>
  </Link> : <><VenueVotes eventId={eventId} venues={venues}/><VenueSearch/>{organizationSlug && <GroupVenueHistory organizationSlug={organizationSlug} eventId={eventId}/>}</>}
  {canManage && <div style={{display:'grid',gap:8}}>
   <label>Choose the event venue
    <select value={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.value)}>
     <option value="">Select a venue</option>
     {choices.map(venue => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
    </select>
   </label>
   <button type="button" disabled={busy || !confirmed || confirmed === confirmedVenue?.id} onClick={() => void save(confirmed)}>{busy ? 'Saving…' : confirmedVenue ? 'Change confirmed venue' : 'Confirm venue'}</button>
   {confirmedVenue && <button type="button" disabled={busy} onClick={() => void save(null)}>Reopen venue voting</button>}
   <details><summary>Manage candidate venues</summary>
    <div style={{maxHeight:240,overflow:'auto'}}>{catalog.filter(venue => venue.status==='active').map(venue => <label key={venue.id} style={{display:'flex',gap:8,padding:5}}>
     <input type="checkbox" disabled={busy || venue.id === confirmedVenue?.id} checked={selected.includes(venue.id)} onChange={event => {setSelected(event.target.checked ? [...selected,venue.id] : selected.filter(id => id!==venue.id));if(!event.target.checked && confirmed===venue.id)setConfirmed('')}}/>{venue.name}
    </label>)}</div>
    <button type="button" disabled={busy} onClick={() => void save(confirmedVenue?.id || null)}>Save candidates</button>
   </details>
  </div>}
  {message && <p role="status">{message}</p>}
 </section>
}
