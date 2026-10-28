import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { SignInLink } from '../components/SignInLink'
export function InvitationAcceptPage(){
 const {id}=useParams(),{token}=useAuth(),[invitation,setInvitation]=useState<{effect?:string|null;purpose:string;expiresAt:number;organization:{name:string;slug:string}}|null>(null),[loading,setLoading]=useState(true),[message,setMessage]=useState(''),[preview,setPreview]=useState(''),[busy,setBusy]=useState(false),[accepted,setAccepted]=useState(false),[awaitingConfirmation,setAwaitingConfirmation]=useState(false)
 const base=`/api/org/api/network/invitations/${encodeURIComponent(id||'')}`
 useEffect(()=>{
  setInvitation(null);setMessage('');setPreview('');setAccepted(false);setAwaitingConfirmation(false)
  setLoading(true)
  const controller=new AbortController()
  void fetch(base+'/public',{credentials:'omit',signal:controller.signal,cache:'no-store'}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.detail||data.error);if(!controller.signal.aborted)setInvitation(data)}).catch(e=>{if(!controller.signal.aborted)setMessage(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return()=>controller.abort()
 },[base,token])
 async function accept(){
  setBusy(true);setMessage('')
  try{const response=await fetch(`${base}/${preview?'apply':'preview'}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(preview?{previewId:preview,confirm:true}:{})});const data=await response.json();if(!response.ok)throw new Error(data.detail||data.error);if(preview){setAccepted(true);setAwaitingConfirmation(!!data.pendingConfirmation?.length);window.dispatchEvent(new Event('organization-access-change'))}else setPreview(data.previewId)}
  catch(e){setPreview('');setMessage(e instanceof Error?e.message:'Could not accept invitation')}
  finally{setBusy(false)}
 }
 return <main className="page"><section className="portal-card"><h1>Organization invitation</h1>
 {loading?<p role="status">Loading invitation…</p>:accepted?<><p role="status">Invitation accepted.</p>{awaitingConfirmation&&<p>Some classes await organizer confirmation before appearing publicly.</p>}</>:invitation?<><h2>You’re invited to {invitation.organization.name}</h2><p>{invitation.effect}</p><p>Invitation expires {new Date(invitation.expiresAt).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'})}.</p>{!token?<p><SignInLink /> to accept, or create an account using the email address that received this invitation. Verify that address before accepting.</p>:<button type="button" className="btn-primary" disabled={busy} onClick={()=>void accept()}>{preview?'Confirm acceptance':'Review acceptance'}</button>}</>:null}
 {message&&<p role="alert">{message}</p>}
 </section></main>
}
