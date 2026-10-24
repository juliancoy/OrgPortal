import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { SignInLink } from '../components/SignInLink'
type Application={id:string;eventId:string;contactName:string;email:string;organizationName:string;title:string;summary:string;teammateEmail:string|null;organizationId:string|null;teamReady:boolean;claimed:boolean}
export function GuestPresentationClaimPage(){
 const {eventId,submissionId}=useParams(),{token,isLoading}=useAuth()
 const [teammateEmail,setTeammateEmail]=useState('')
 const [application,setApplication]=useState<Application|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 const base=`/api/org/api/network/events/${encodeURIComponent(eventId||'')}/presentations/guest/${encodeURIComponent(submissionId||'')}`
 useEffect(()=>{
  setApplication(null);setMessage('');setTeammateEmail('')
  if(!token)return
  const controller=new AbortController()
  void fetch(base,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal,cache:'no-store'})
   .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.message||data.detail||'Unable to load your submission');return data})
   .then(data=>{if(!controller.signal.aborted){setApplication(data.application);setTeammateEmail(data.application.teammateEmail||'')}})
   .catch(error=>{if(!controller.signal.aborted)setMessage(error.message)})
  return()=>controller.abort()
 },[base,token])
 async function claim(){
  if(!token||!application||busy)return
  setBusy(true);setMessage('')
  try{
   const response=await fetch(`${base}/claim`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({confirm:true,teammateEmail})})
   const data=await response.json();if(!response.ok)throw new Error(data.message||data.detail||'Unable to claim your submission')
   setApplication({...application,claimed:true,teamReady:true,organizationId:data.organizationId});setMessage('Submission claimed. Your team organization is created and your teammate’s invitation is queued for delivery.')
  }catch(error){setMessage(error instanceof Error?error.message:'Unable to claim your submission')}
  finally{setBusy(false)}
 }
 return <main className="page"><section className="portal-card" style={{maxWidth:640,marginInline:'auto'}}>
  <h1>{application?.teamReady?'Your presentation submission':'Claim your presentation submission'}</h1>
  <p>We recommend claiming your submission to your account to keep event communications and your presentation records organized.</p>
  {isLoading?<p role="status">Loading your account…</p>:!token?<p><SignInLink /> or create an account using the same email address you supplied on your application. Verify that email address, then return here to claim your submission, create your team organization, and invite your teammate.</p>:application?<>
   <h2>{application.title}</h2><p>{application.organizationName} · {application.contactName}</p><p style={{whiteSpace:'pre-wrap'}}>{application.summary}</p>
   {application.teamReady?<><p>This application is saved to your account. Your teammate has an invitation to join your team organization; they join only after accepting.</p><Link to={`/orgs/${encodeURIComponent(application.organizationId!)}`}>View your team organization</Link></>:<form onSubmit={event=>{event.preventDefault();void claim()}}>
    <p>Claim this application and create “{application.organizationName}” as a new team organization that you own. Your proposal remains private to you and the event organizers. This does not grant access to an existing organization.</p>
    <label>Teammate’s email<input type="email" required maxLength={254} value={teammateEmail} onChange={event=>setTeammateEmail(event.target.value)} disabled={!!application.teammateEmail||busy} /></label>
    <p>Your teammate will receive an email invitation to join the created organization. They must verify their email and accept before joining.</p>
    <button type="submit" className="btn-primary" disabled={busy}>{busy?'Creating team…':'Claim submission, create team and invite teammate'}</button>
   </form>}
  </>:!message?<p role="status">Loading your submission…</p>:null}
  {message&&<p role={application?.claimed?'status':'alert'}>{message}</p>}
 </section></main>
}
