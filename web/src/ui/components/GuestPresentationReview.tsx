import { useEffect, useState } from 'react'
import { useAuth } from '../../app/AppProviders'
type Application={id:string;contact_name:string;email:string;organization_name:string;title:string;summary:string;acknowledgement_status:string;claimed_at:string|null;teammate_email:string|null}
const deliveryLabels:Record<string,string>={not_requested:'Not requested',sending:'Send started; confirmation pending',accepted:'Accepted for sending',uncertain:'Send could not be confirmed',unavailable:'Sender unavailable'}
export function GuestPresentationReview({eventId}:{eventId:string}){
 const {token}=useAuth()
 const [rows,setRows]=useState<Application[]>([]),[status,setStatus]=useState('Loading applications…')
 useEffect(()=>{
  if(!token)return
  const controller=new AbortController()
  void fetch(`/api/org/api/network/events/${encodeURIComponent(eventId)}/presentations/guest-review`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal,cache:'no-store'})
   .then(async response=>{if(!response.ok)throw new Error('Unable to load applications');return response.json()})
   .then(data=>{setRows(data.submissions);setStatus(data.submissions.length?'':'No applications without login yet.')})
   .catch(error=>{if(!controller.signal.aborted)setStatus(error.message)})
  return()=>controller.abort()
 },[eventId,token])
 return <section aria-label="Applications without login"><h3>Applications without login</h3><p className="muted">Private intake. Organization names are supplied by applicants. Claiming confirms the email address on the applicant’s signed-in account.</p>{status&&<p role="status">{status}</p>}{rows.map(row=><article className="presentation-submission" key={row.id}><h4>{row.title}</h4><p>{row.organization_name} · {row.contact_name}</p><a href={`mailto:${row.email}`}>{row.email}</a><p>Teammate: {row.teammate_email||'Not supplied'}</p><p className="muted">Thank-you email: {deliveryLabels[row.acknowledgement_status]||'Unknown'} · {row.claimed_at?'Claimed to an account':'Not yet claimed'}</p><p style={{whiteSpace:'pre-wrap'}}>{row.summary}</p></article>)}</section>
}
