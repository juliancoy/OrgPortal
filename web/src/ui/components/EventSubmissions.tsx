import {ApplicantDetails} from './ApplicantDetails'
import { invalidatePublicOrganizationData } from '../../data/publicOrganization/cache'
import { GuestPresentationReview } from './GuestPresentationReview'
import { PresentationFinalRound } from './PresentationFinalRound'
import { EventApplicationReview } from './EventApplicationReview'
import type { PresentationApplication } from './EventPresentations'
import type { SubmissionAttachment } from './submissionAttachments'
import { useEffect, useRef, useState } from 'react'
import Star from 'lucide-react/dist/esm/icons/star.mjs'
import { useAuth } from '../../app/AppProviders'
import { OrgImage } from './media/OrgImage'
import './event-presentations.css'

export type Submission={presenters?:{name:string;photo?:string;pending?:boolean}[];submission_id:string;attachments?:SubmissionAttachment[];organization_id:string;organization_name:string;organization_slug:string;image_url:string|null;title:string;summary:string;status:string;favorites:number}
export function EventSubmissions({eventId,onEdit,onDeleted}:{eventId:string;onEdit:(application:PresentationApplication)=>void;onDeleted:(submissionId:string)=>void}) {
 const {token}=useAuth()
 const base=`/api/org/api/network/events/${encodeURIComponent(eventId)}/presentations`
 const favoriteIds=useRef<string[]>([]),savingIds=useRef(new Set<string>()),favoriteEpoch=useRef(0)
 const [savingFavorites,setSavingFavorites]=useState<string[]>([])
 const [quota,setQuota]=useState<{id:string;sequence:number}|null>(null)
 const quotaTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
 function flashQuota(id:string){
  clearTimeout(quotaTimer.current)
  setQuota(previous=>({id,sequence:(previous?.sequence||0)+1}))
  quotaTimer.current=setTimeout(()=>setQuota(null),2400)
 }
 useEffect(()=>()=>clearTimeout(quotaTimer.current),[])
 const [active,setActive]=useState<{id:string;mode:'hover'|'modal';anchor:HTMLButtonElement}|null>(null)
 const activeRef=useRef(active);activeRef.current=active
 const opening=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),closing=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
 function cancelHover(){clearTimeout(opening.current);clearTimeout(closing.current)}
 function preview(row:Submission,anchor:HTMLButtonElement){
  if(activeRef.current?.mode==='modal'||!window.matchMedia('(hover:hover) and (pointer:fine) and (min-width:900px)').matches)return
  cancelHover();opening.current=setTimeout(()=>setActive({id:row.submission_id,mode:'hover',anchor}),160)
 }
 function leave(){clearTimeout(opening.current);clearTimeout(closing.current);closing.current=setTimeout(()=>{
  const current=activeRef.current
  if(current?.mode==='hover'&&!document.getElementById(`applicant-details-${current.id}`)?.contains(document.activeElement))setActive(null)
 },280)}
 function open(row:Submission,anchor:HTMLButtonElement){cancelHover();setActive({id:row.submission_id,mode:'modal',anchor})}
 useEffect(()=>{setActive(null);cancelHover();return cancelHover},[eventId,token])
 const [rows,setRows]=useState<Submission[]>([]),[favorites,setFavorites]=useState<string[]>([])
 const [editableApplications,setEditableApplications]=useState<Record<string,PresentationApplication>>({})
 const [reviewOpen,setReviewOpen]=useState(false),[reviewRevision,setReviewRevision]=useState(0)
 const [finalPhase,setFinalPhase]=useState<'shortlist'|'open'|'closed'>('shortlist')
 useEffect(()=>setReviewOpen(false),[base,token])
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
  const controller=new AbortController();favoriteEpoch.current++;favoriteIds.current=[];savingIds.current.clear();setSavingFavorites([]);setQuota(null);clearTimeout(quotaTimer.current);setReady(false);setCanManage(false);setError('');setFavorites([]);setRows([]);setManagedTeams([]);setEditableApplications({})
  void Promise.all([request('/submissions',{},controller.signal),token?request('/favorites',{},controller.signal):Promise.resolve({favorites:[]}),token?request('',{},controller.signal):Promise.resolve({canReview:false}),token?fetch('/api/org/api/network/orgs?mine=true&limit=500',{signal:controller.signal,cache:'no-store',headers:{Authorization:`Bearer ${token}`}}).then(async response=>{if(!response.ok)throw new Error('Could not load your team management access.');return response.json() as Promise<{id:string;my_role:string}[]>}):Promise.resolve([])]).then(([data,own,access,teams])=>{
   if(controller.signal.aborted)return
   const managedIds=new Set(teams.filter(team=>team.my_role==='owner'||team.my_role==='administrator').map(team=>team.id))
   setEditableApplications(Object.fromEntries((access.submissions||[]).filter((application:PresentationApplication)=>managedIds.has(application.organization_id)).map((application:PresentationApplication)=>[application.submission_id,application])))
   setRows(data.submissions);setNext(data.next);favoriteIds.current=own.favorites;setFavorites(own.favorites);setLimit(data.favoriteLimit);setLimitDraft(String(data.favoriteLimit));setCanManage(access.canReview);setManagedTeams((access.submissions||[]).map((row:Submission)=>row.submission_id));setReady(true)
  }).catch(reason=>{if(!controller.signal.aborted)setError(reason.message)})
  return()=>{controller.abort();favoriteEpoch.current++}
 // All request dependencies are represented by base and token.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[base,token,revision])
 async function refreshSubmissions(){
  const refreshed:Submission[]=[];let cursor:string|null=null
  do{const data=await request('/submissions'+(cursor?'?after='+encodeURIComponent(cursor):''));refreshed.push(...data.submissions);cursor=data.next}while(cursor&&refreshed.length<rows.length)
  setRows(refreshed);setNext(cursor)
 }
 async function toggle(row:Submission){
  const id=row.submission_id,selected=!favoriteIds.current.includes(id),epoch=favoriteEpoch.current
  if(busy||!token||!ready||savingIds.current.has(id))return
  if(selected&&favoriteIds.current.length>=limit){flashQuota(id);return}
  setQuota(null);clearTimeout(quotaTimer.current)
  savingIds.current.add(id);setSavingFavorites([...savingIds.current]);setError('')
  function updateSelection(value:boolean){
   favoriteIds.current=value?[...favoriteIds.current,id]:favoriteIds.current.filter(item=>item!==id)
   setFavorites(favoriteIds.current)
   setRows(previous=>previous.map(item=>item.submission_id===id?{...item,favorites:Math.max(0,item.favorites+(value?1:-1))}:item))
  }
  updateSelection(selected)
  try{
   await request(`/favorites/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify({selected})});await invalidatePublicOrganizationData()
  }catch(reason){
   if(epoch!==favoriteEpoch.current)return
   updateSelection(!selected)
   setError(reason instanceof Error?reason.message:'Could not save favorite')
   if(selected)try{const own=await request('/favorites');if(epoch===favoriteEpoch.current){favoriteIds.current=own.favorites;setFavorites(own.favorites);setLimit(own.limit);if(own.favorites.length>=own.limit&&!own.favorites.includes(id)){setError('');flashQuota(id)}}}catch{/* Keep the save error visible. */}
  }finally{
   if(epoch===favoriteEpoch.current){savingIds.current.delete(id);setSavingFavorites([...savingIds.current])}
  }
 }

 const activeRow=rows.find(row=>row.submission_id===active?.id)
 const quotaText=quota?`You’ve used your ${limit===3?'three':limit} ${limit===1?'vote':'votes'}.`:''
 return <section className="portal-card presentation-applications" aria-label="Event submissions">
  <h2 tabIndex={-1}>Applicants</h2>
  <PresentationFinalRound eventId={eventId} canManage={canManage} onPhaseChange={setFinalPhase} />
  {canManage&&<details className="submission-review-tools" onToggle={event=>setReviewOpen(event.currentTarget.open)}>
   <summary>Manage submissions</summary>
   {reviewOpen&&finalPhase==='shortlist'&&<PresentationFinalRound eventId={eventId} canManage={canManage} onPhaseChange={setFinalPhase} managementOnly />}
  {canManage&&finalPhase==='shortlist'&&<form className="presentation-form" aria-label="Submission voting settings" onSubmit={event=>{event.preventDefault();setBusy(true);setError('');void request('/settings',{method:'PUT',body:JSON.stringify({favoriteLimit:Number(limitDraft)})}).then(data=>{setLimit(data.favoriteLimit);setRevision(value=>value+1)}).catch(reason=>setError(reason.message)).finally(()=>setBusy(false))}}>
   <label>Maximum favorites per person<input type="number" min="1" max="100" step="1" required value={limitDraft} onChange={event=>setLimitDraft(event.target.value)} /></label>
   <button className="btn-secondary" type="submit" disabled={busy}>Save favorite limit</button>
  </form>}

   {reviewOpen&&<GuestPresentationReview eventId={eventId} />}
   {reviewOpen&&<EventApplicationReview eventId={eventId} refreshRevision={reviewRevision} onUpdated={()=>{void refreshSubmissions().catch(reason=>setError(reason.message))}} />}
  </details>}
  {error&&<p role="alert">{error} <button type="button" className="btn-secondary" onClick={()=>setRevision(value=>value+1)}>Refresh submissions</button></p>}
  {!ready&&!error&&<p role="status">Loading submissions…</p>}
  {ready&&!rows.length&&<p>No submissions yet.</p>}
  <ul className="applicant-list" aria-label="Demo Day applicants">{[...rows].sort((a,b)=>b.favorites-a.favorites||(a.submission_id<b.submission_id?-1:a.submission_id>b.submission_id?1:0)).map(row=><li key={row.submission_id} className={`presentation-submission applicant-row${favorites.includes(row.submission_id)?' is-selected':''}${active?.id===row.submission_id?' is-highlighted':''}`}>
   <button type="button" className="applicant-open" aria-label={`View ${row.organization_name} application: ${row.title}`} aria-haspopup="dialog" aria-expanded={active?.id===row.submission_id} aria-controls={active?.id===row.submission_id?`applicant-details-${row.submission_id}`:undefined} onPointerEnter={event=>{if(event.pointerType==='mouse')preview(row,event.currentTarget)}} onPointerLeave={leave} onBlur={leave} onClick={event=>open(row,event.currentTarget)}>
    <OrgImage src={row.image_url} alt=""/><span><strong>{row.organization_name}</strong><small>{row.title}</small></span>
   </button>
   <div className="applicant-row-vote">{finalPhase==='shortlist'?<button type="button" className={`applicant-vote${favorites.includes(row.submission_id)?' is-selected':''}${quota?.id===row.submission_id?' is-limit':''}`} aria-pressed={favorites.includes(row.submission_id)} aria-label={`${favorites.includes(row.submission_id)?'Remove favorite':'Favorite'}: ${row.title} (${row.favorites} ${row.favorites===1?'star':'stars'})`} disabled={!token||!ready||busy||savingFavorites.includes(row.submission_id)} onClick={()=>{void toggle(row)}}><Star size={20} aria-hidden="true" fill={favorites.includes(row.submission_id)?'currentColor':'none'}/><span>{row.favorites}</span></button>:<span className="applicant-vote"><Star size={20} aria-hidden="true"/>{row.favorites}</span>}
   </div>
  </li>)}</ul>
  {quota&&<p key={quota.sequence} className="submission-vote-limit" role="status">{quotaText}</p>}
  {active&&activeRow&&<ApplicantDetails row={activeRow} eventId={eventId} mode={active.mode} anchor={active.anchor} selected={favorites.includes(active.id)} voting={finalPhase==='shortlist'} disabled={!token||!ready||busy||savingFavorites.includes(active.id)} quotaText={quota?.id===active.id?quotaText:''} canManage={canManage||managedTeams.includes(active.id)} application={editableApplications[active.id]} onVote={()=>{void toggle(activeRow)}} onClose={()=>{cancelHover();setActive(null)}} onKeepOpen={()=>open(activeRow,active.anchor)} onEnter={cancelHover} onLeave={leave} onEdit={onEdit} onDeleted={submissionId=>{
   setActive(null);setRows(previous=>previous.filter(item=>item.submission_id!==submissionId));favoriteIds.current=favoriteIds.current.filter(id=>id!==submissionId);setFavorites(favoriteIds.current);setReviewRevision(value=>value+1);onDeleted(submissionId)
  }}/>}
  {next&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>{
   setBusy(true);setError('');void request('/submissions?after='+encodeURIComponent(next)).then(data=>{setRows(previous=>[...new Map([...previous,...data.submissions].map((row:Submission)=>[row.submission_id,row])).values()]);setNext(data.next)}).catch(reason=>setError(reason.message)).finally(()=>setBusy(false))
  }}>Load more submissions</button>}
 </section>
}
