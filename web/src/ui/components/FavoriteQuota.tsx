import './favorite-quota.css'
import {useEffect,useRef,useState} from 'react'
import {Link} from 'react-router-dom'
export type FavoriteChoice={submission_id:string;title:string;organization_name:string;favorites:number}
export function FavoriteQuota({eventId,ids,limit,token,onRemove,onClose}:{eventId:string;ids:string[];limit:number;token:string;onRemove:(choice:FavoriteChoice)=>Promise<void>;onClose:()=>void}){
 const [choices,setChoices]=useState<FavoriteChoice[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false)
 const heading=useRef<HTMLHeadingElement>(null)
 useEffect(()=>{heading.current?.focus()},[])
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');setChoices([])
  void (async()=>{const found:FavoriteChoice[]=[];let cursor:string|null=null
   do{const response=await fetch(`/api/org/api/network/events/${encodeURIComponent(eventId)}/presentations/submissions${cursor?'?after='+encodeURIComponent(cursor):''}`,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error('Could not load your starred submissions.');const data=await response.json();found.push(...data.submissions.filter((row:FavoriteChoice)=>ids.includes(row.submission_id)));cursor=data.next}while(cursor&&found.length<ids.length)
   if(!controller.signal.aborted)setChoices(found)
  })().catch(reason=>{if(!controller.signal.aborted)setError(reason.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return()=>controller.abort()
 },[eventId,ids,token])
 return <section className="favorite-quota" aria-label="Manage your stars">
  <h3 ref={heading} tabIndex={-1}>Your star quota is full</h3>
  <p role="alert">You’ve used all {limit} stars for this event. Remove a star below, then star your new choice.</p>
  {loading&&<p role="status">Loading your starred submissions…</p>}
  {error&&<p role="alert">{error}</p>}
  <ul>{choices.map(choice=><li key={choice.submission_id}><span><strong>{choice.organization_name}</strong><br/>{choice.title}</span><button type="button" className="btn-secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onRemove(choice);onClose()}catch(reason){setError(reason instanceof Error?reason.message:'Could not remove this star.')}finally{setBusy(false)}}}>Remove star: {choice.title}</button></li>)}</ul>
  {!loading&&!choices.length&&<p>Your ballot may have changed. Refresh your stars and try again.</p>}
  <div className="favorite-quota-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Keep my stars</button><Link to={`/events/${encodeURIComponent(eventId)}?tab=submissions#submissions`}>Review all submissions</Link></div>
 </section>
}
