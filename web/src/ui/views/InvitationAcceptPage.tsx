import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { SignInLink } from '../components/SignInLink'
export function InvitationAcceptPage(){
 const {id}=useParams(),{token}=useAuth(),[invitation,setInvitation]=useState<{purpose:string;organization:{name:string;slug:string}}|null>(null),[message,setMessage]=useState(''),[preview,setPreview]=useState(''),[busy,setBusy]=useState(false),[accepted,setAccepted]=useState(false)
 const base=`/api/org/api/network/invitations/${encodeURIComponent(id||'')}`
 useEffect(()=>{
  setInvitation(null);setMessage('');setPreview('');setAccepted(false)
  if(!token)return
  const controller=new AbortController()
  void fetch(base,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal,cache:'no-store'}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.detail||data.error);if(!controller.signal.aborted)setInvitation(data)}).catch(e=>{if(!controller.signal.aborted)setMessage(e.message)})
  return()=>controller.abort()
 },[base,token])
 async function accept(){
  setBusy(true);setMessage('')
  try{const response=await fetch(`${base}/${preview?'apply':'preview'}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(preview?{previewId:preview,confirm:true}:{})});const data=await response.json();if(!response.ok)throw new Error(data.detail||data.error);if(preview){setAccepted(true);window.dispatchEvent(new Event('organization-access-change'))}else setPreview(data.previewId)}
  catch(e){setPreview('');setMessage(e instanceof Error?e.message:'Could not accept invitation')}
  finally{setBusy(false)}
 }
 return <main className="page"><section className="portal-card"><h1>Organization invitation</h1>
 {!token?<p><SignInLink /> or create an account with the email address that received this invitation, then verify that address to review it.</p>:accepted?<p role="status">Invitation accepted.</p>:invitation?<><h2>{invitation.organization.name}</h2><p>{invitation.purpose==='member'?'Join this organization as a member.':'Accept Volunteer recognition for three months. This grants no membership permissions.'}</p><button type="button" className="btn-primary" disabled={busy} onClick={()=>void accept()}>{preview?'Confirm acceptance':'Review acceptance'}</button></>:null}
 {message&&<p role="alert">{message}</p>}
 </section></main>
}
