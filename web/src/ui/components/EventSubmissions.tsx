import { OrganizationAvatar } from './OrganizationAvatar'
import { SubmissionAttachments } from './SubmissionAttachments'
import type { SubmissionAttachment } from './submissionAttachments'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Star } from 'lucide-react'
import { useAuth } from '../../app/AppProviders'
import { BioMarkdown } from './profile/BioMarkdown'
import { OrgImage } from './media/OrgImage'
import './event-presentations.css'

type Submission={presenters?:{name:string;photo?:string;pending?:boolean}[];submission_id:string;attachments?:SubmissionAttachment[];organization_id:string;organization_name:string;organization_slug:string;image_url:string|null;title:string;summary:string;status:string;favorites:number}
export function EventSubmissions({eventId}:{eventId:string}) {
 const {token}=useAuth(),location=useLocation()
 const base=`/api/org/api/network/events/${encodeURIComponent(eventId)}/presentations`
 const [rows,setRows]=useState<Submission[]>([]),[favorites,setFavorites]=useState<string[]>([])
 const [managedTeams,setManagedTeams]=useState<string[]>([])
 const [limit,setLimit]=useState(3),[canManage,setCanManage]=useState(false),[limitDraft,setLimitDraft]=useState('3')
 const [next,setNext]=useState<string|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 async function request(path:string,options:RequestInit={},signal?:AbortSignal){
  const response=await fetch(base+path,{...options,signal,cache:'no-store',headers:{...(token?{Authorization:`Bearer ${token}`}:{}) ,'Content-Type':'application/json'}})
  const text=await response.text();let data
  try{data=JSON.parse(text)}catch{throw new Error(response.ok?'The server returned an invalid response.':text||'Could not complete the request')}
  if(!response.ok)throw new Error(data.message||data.detail||data.error||'Could not complete the request');return data
 }
 useEffect(()=>{
  const controller=new AbortController();setReady(false);setCanManage(false);setError('');setFavorites([]);setRows([])
  void Promise.all([request('/submissions',{},controller.signal),token?request('/favorites',{},controller.signal):Promise.resolve({favorites:[]}),token?request('',{},controller.signal):Promise.resolve({canReview:false})]).then(([data,own,access])=>{
   if(controller.signal.aborted)return
   setRows(data.submissions);setNext(data.next);setFavorites(own.favorites);setLimit(data.favoriteLimit);setLimitDraft(String(data.favoriteLimit));setCanManage(access.canReview);setManagedTeams((access.submissions||[]).map((row:Submission)=>row.submission_id));setReady(true)
  }).catch(reason=>{if(!controller.signal.aborted)setError(reason.message)})
  return()=>controller.abort()
 // All request dependencies are represented by base and token.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[base,token,revision])
 async function toggle(row:Submission){
  if(busy||!token)return;setBusy(true);setError('')
  try{
   await request(`/favorites/${encodeURIComponent(row.submission_id)}`,{method:'PUT',body:JSON.stringify({selected:!favorites.includes(row.submission_id)})})
   const own=await request('/favorites');setFavorites(own.favorites);setLimit(own.limit)
   const refreshed:Submission[]=[];let cursor:string|null=null
   do{const data=await request('/submissions'+(cursor?'?after='+encodeURIComponent(cursor):''));refreshed.push(...data.submissions);cursor=data.next}while(cursor&&refreshed.length<rows.length)
   setRows(refreshed);setNext(cursor)
  }catch(reason){setError(reason instanceof Error?reason.message:'Could not save favorite')}
  finally{setBusy(false)}
 }
 return <section className="portal-card presentation-applications" aria-label="Event submissions">
  <h2>Submissions</h2><p>Explore the teams and select up to {limit} favorites for this event. You can change your selections.</p>
  {token?(ready&&<p role="status">{favorites.length} of {limit} favorites selected</p>):<p><Link to={`/users/login?next=${encodeURIComponent(location.pathname+location.search+'#submissions')}`}>Sign in</Link> to save your favorites.</p>}
  {canManage&&<form className="presentation-form" aria-label="Submission voting settings" onSubmit={event=>{event.preventDefault();setBusy(true);setError('');void request('/settings',{method:'PUT',body:JSON.stringify({favoriteLimit:Number(limitDraft)})}).then(data=>{setLimit(data.favoriteLimit);setRevision(value=>value+1)}).catch(reason=>setError(reason.message)).finally(()=>setBusy(false))}}>
   <label>Maximum favorites per person<input type="number" min="1" max="100" step="1" required value={limitDraft} onChange={event=>setLimitDraft(event.target.value)} /></label>
   <button className="btn-secondary" type="submit" disabled={busy}>Save favorite limit</button>
  </form>}
  {error&&<p role="alert">{error} <button type="button" className="btn-secondary" onClick={()=>setRevision(value=>value+1)}>Refresh submissions</button></p>}
  {!ready&&!error&&<p role="status">Loading submissions…</p>}
  {ready&&!rows.length&&<p>No submissions yet.</p>}
  {rows.map(row=><article key={row.submission_id} className="presentation-submission">
   <div className="submission-team"><OrgImage src={row.image_url} alt="" style={{width:48,height:48,objectFit:'contain'}} /><Link to={`/orgs/${encodeURIComponent(row.organization_slug)}`}>{row.organization_name}</Link></div>
   <h3>{row.title}</h3><BioMarkdown value={row.summary} /><p>Status: {row.status} · {row.favorites} {row.favorites===1?'favorite':'favorites'}</p>
   {!!row.presenters?.length&&<section aria-label="Presenters"><h4>Presenters</h4><ul className="team-people-list">{row.presenters.map((person,index)=><li key={index}><OrganizationAvatar name={person.name} src={person.photo} status={null} /><span>{person.name}{person.pending?' · awaiting invitation acceptance':''}</span></li>)}</ul></section>}
   <SubmissionAttachments eventId={eventId} submissionId={row.submission_id} initial={row.attachments} canManage={canManage||managedTeams.includes(row.submission_id)} />
   <button type="button" className={favorites.includes(row.submission_id)?'btn-primary':'btn-secondary'} aria-pressed={favorites.includes(row.submission_id)} aria-label={`${favorites.includes(row.submission_id)?'Remove favorite':'Favorite'}: ${row.title}`} disabled={!token||!ready||busy||(!favorites.includes(row.submission_id)&&favorites.length>=limit)} onClick={()=>void toggle(row)}><Star size={18} aria-hidden="true" fill={favorites.includes(row.submission_id)?'currentColor':'none'} /> {favorites.includes(row.submission_id)?'Selected favorite':'Choose favorite'}</button>
  </article>)}
  {next&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>{
   setBusy(true);setError('');void request('/submissions?after='+encodeURIComponent(next)).then(data=>{setRows(previous=>[...new Map([...previous,...data.submissions].map((row:Submission)=>[row.submission_id,row])).values()]);setNext(data.next)}).catch(reason=>setError(reason.message)).finally(()=>setBusy(false))
  }}>Load more submissions</button>}
 </section>
}
