import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import type { Venue } from './EventVenues'
type Summary={ballots_count:number;closed:boolean;venues:Array<Venue&{points:number;first_place_votes:number}>}
export function VenueRanking({eventId,venues}:{eventId:string;venues:Venue[]}){
 const {token}=useAuth(),[order,setOrder]=useState<string[]>([]),[summary,setSummary]=useState<Summary|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 const base=`/api/org/api/network/events/${eventId}/venue-rankings`
 useEffect(()=>{let active=true;setMessage('');setSummary(null);setOrder(venues.map(v=>v.id));
  fetch(base+'/public').then(r=>{if(!r.ok)throw new Error('Unable to load venue preferences.');return r.json()}).then(data=>{if(active)setSummary(data)}).catch(e=>{if(active)setMessage(e.message)})
  if(token)fetch(base,{headers:{Authorization:`Bearer ${token}`}}).then(r=>{if(!r.ok)throw new Error('Unable to load your saved venue ranking.');return r.json()}).then(data=>{if(active){setOrder([...data.venue_ids,...venues.map(v=>v.id).filter(id=>!data.venue_ids.includes(id))]);if(data.needs_update)setMessage('Candidates changed. Review and save your updated ranking.')}}).catch(e=>{if(active)setMessage(e.message)})
  return()=>{active=false}
 },[eventId,token,venues])
 function move(index:number,direction:number){setOrder(previous=>{const next=[...previous];[next[index],next[index+direction]]=[next[index+direction],next[index]];return next})}
 async function save(){setBusy(true);setMessage('');try{const r=await fetch(base,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({venue_ids:order})});if(!r.ok)throw new Error((await r.json()).message||'Unable to save ranking.');setSummary(await r.json());setMessage('Your venue ranking is saved.')}catch(e){setMessage(String(e))}finally{setBusy(false)}}
 if(!venues.length)return null
 return <section aria-label="Venue preferences" style={{display:'grid',gap:8}}><h3>Rank the candidate venues</h3>{summary?.closed?<p>The organizer has confirmed a venue. Ranking is closed.</p>:token?<><p>Put your favorite first. Your saved ranking can be changed until a venue is confirmed.</p><ol>{order.map((id,index)=>{const v=venues.find(v=>v.id===id);return v?<li key={id} style={{marginBottom:8}}><span>{v.name}</span> <button type="button" aria-label={`Move ${v.name} up`} disabled={index===0||busy} onClick={()=>move(index,-1)}>↑</button> <button type="button" aria-label={`Move ${v.name} down`} disabled={index===order.length-1||busy} onClick={()=>move(index,1)}>↓</button></li>:null})}</ol><button disabled={busy} onClick={()=>void save()}>Save venue ranking</button></>:<p><Link to={`/users/login?next=${encodeURIComponent(location.pathname)}`}>Sign in to rank venues</Link></p>}{message&&<p role="status">{message}</p>}{summary&&<details open={summary.ballots_count>0}><summary>Community preferences · {summary.ballots_count} {summary.ballots_count===1?'ranking':'rankings'}</summary><p>Each ranking gives {venues.length} points to first place, then one fewer per position. Only rankings covering the current candidates count.</p><ol>{summary.venues.map(v=><li key={v.id}>{v.name} — {v.points} points · {v.first_place_votes} first-place votes</li>)}</ol></details>}</section>
}
