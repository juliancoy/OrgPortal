import { useEffect, useId, useState } from 'react'
import { useAuth } from '../../app/AppProviders'
type Status='all'|'submitted'|'accepted'|'declined'
type Submission={presenters?:{name:string}[];submission_id:string;organization_id:string;organization_name:string;title:string;summary:string;status:string;updated_at:string}
type Review={submissions:Submission[];counts:Record<Status,number>;total:number;page:number;pages:number;pageSize:number}
const labels:Record<Status,string>={all:'All',submitted:'Pending',accepted:'Accepted',declined:'Declined'}
export function EventApplicationReview({eventId,onUpdated,refreshRevision=0}:{eventId:string;onUpdated?:()=>void;refreshRevision?:number}){
 const {token}=useAuth(),filterId=useId()
 const [status,setStatus]=useState<Status>('all'),[page,setPage]=useState(1),[revision,setRevision]=useState(0)
 const [data,setData]=useState<Review|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[exporting,setExporting]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const base=`/api/org/api/network/events/${encodeURIComponent(eventId)}/presentations`
 useEffect(()=>{setStatus('all');setPage(1);setData(null);setNotice('')},[eventId,token])
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');setData(null)
  void fetch(`${base}/review?${new URLSearchParams({status,page:String(page)})}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal,cache:'no-store'})
   .then(async response=>{if(!response.ok)throw new Error('Could not load applications. Check your organizer access and retry.');return response.json() as Promise<Review>})
   .then(result=>{if(!controller.signal.aborted)setData(result)})
   .catch(e=>{if(!controller.signal.aborted)setError(e.message)})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return()=>controller.abort()
 },[base,token,status,page,revision,refreshRevision])
 async function update(row:Submission,next:string){
  setBusy(true);setError('');setNotice('')
  try{
   const response=await fetch(`${base}/${encodeURIComponent(row.submission_id)}`,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({status:next})})
   if(!response.ok)throw new Error('Could not change this application’s status.')
   setNotice(`${row.organization_name} marked ${next==='submitted'?'pending':next}.`);setRevision(v=>v+1);onUpdated?.()
  }catch(e){setError(e instanceof Error?e.message:'Could not save application')}
  finally{setBusy(false)}
 }
 async function download(){
  setExporting(true);setError('')
  try{
   const response=await fetch(`${base}/export?${new URLSearchParams({status})}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'})
   if(!response.ok)throw new Error('Could not export applications.')
   const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=`event-applications-${status}.csv`;document.body.append(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000)
  }catch(e){setError(e instanceof Error?e.message:'Could not export applications')}
  finally{setExporting(false)}
 }
 return <section className="application-review" aria-label="Review applications" aria-busy={loading||busy}>
  <div className="application-review-heading"><div><h3>Applications</h3><p className="muted">Review team proposals and manage presentation decisions.</p></div><button type="button" className="btn-secondary" disabled={exporting||loading||!data?.total} onClick={()=>void download()}>{exporting?'Exporting…':'Export CSV'}</button></div>
  {data&&<div className="application-counts" aria-label="Application counts">{(['all','submitted','accepted','declined'] as const).map(key=><span key={key}>{labels[key]} <strong>{data.counts[key]}</strong></span>)}</div>}
  <div className="application-review-toolbar"><label htmlFor={filterId}>Application status</label><select id={filterId} value={status} disabled={busy} onChange={e=>{setStatus(e.target.value as Status);setPage(1);setNotice('')}}>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button type="button" className="btn-secondary" disabled={loading||busy} onClick={()=>setRevision(v=>v+1)}>Refresh applications</button></div>
  <p className="muted">CSV includes every application matching this filter across all pages. Proposals remain available until 90 days after the event.</p>
  {loading&&<p role="status">Loading applications…</p>}
  {error&&<p role="alert">{error} <button type="button" className="btn-secondary" onClick={()=>setRevision(v=>v+1)}>Retry</button></p>}
  {notice&&<p role="status">{notice}</p>}
  {data&&!loading&&<>{data.submissions.length===0?<p>No {status==='all'?'applications':labels[status].toLowerCase()+' applications'} yet.</p>:data.submissions.map(row=><article className="presentation-submission" key={row.submission_id}><h4>{row.organization_name}: {row.title}</h4><p style={{whiteSpace:'pre-wrap'}}>{row.summary}</p>{row.presenters?.length? <p>Presenters: {row.presenters.map(person=>person.name).join(', ')}</p>:null}<p>Status: <strong>{labels[row.status as Status]||row.status}</strong> · Updated {new Date(row.updated_at).toLocaleString()}</p><div>{(['accepted','declined','submitted'] as const).map(next=><button type="button" className="btn-secondary" key={next} disabled={busy||row.status===next} onClick={()=>void update(row,next)}>{next==='accepted'?'Accept':next==='declined'?'Decline':'Mark pending'}</button>)}</div></article>)}
   <nav className="application-pagination" aria-label="Application pages"><button type="button" className="btn-secondary" disabled={busy||data.page<=1} onClick={()=>setPage(data.page-1)}>Previous page</button><span role="status">Page {data.page} of {data.pages} · {data.total} matching applications</span><button type="button" className="btn-secondary" disabled={busy||data.page>=data.pages} onClick={()=>setPage(data.page+1)}>Next page</button></nav>
  </>}
 </section>
}
