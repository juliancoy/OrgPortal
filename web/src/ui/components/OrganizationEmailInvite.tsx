import { useState } from 'react'
import { useAuth } from '../../app/AppProviders'
export function OrganizationEmailInvite({organizationId,email,purpose}:{organizationId:string;email:string;purpose:'member'|'volunteer'}) {
 const {token}=useAuth(),[preview,setPreview]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const normalized=email.trim().toLowerCase()
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))return null
 async function submit(confirm=false){
  setBusy(true);setMessage('')
  try{
   const response=await fetch(`/api/org/api/network/orgs/${encodeURIComponent(organizationId)}/invitations/${confirm?'apply':'preview'}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({email:normalized,purpose,...(confirm?{previewId:preview,confirm:true}:{})})})
   const data=await response.json();if(!response.ok)throw new Error(data.detail||data.error||'Could not invite this person')
   if(confirm){setPreview('');setMessage(data.message);window.dispatchEvent(new CustomEvent('organization-invitations-updated',{detail:{organizationId}}))}else setPreview(data.previewId)
  }catch(error){setPreview('');setMessage(error instanceof Error?error.message:'Could not send invitation')}
  finally{setBusy(false)}
 }
 return <div aria-label="Email invitation">
  {preview?<><p>Invite <strong>{normalized}</strong> to {purpose==='member'?'join as a member':'accept Volunteer recognition'}. They must verify their email and accept within seven days.{purpose==='volunteer'?' This grants no membership permissions.':''}</p><button type="button" className="btn-primary" disabled={busy} onClick={()=>void submit(true)}>Confirm email invitation</button>{' '}<button type="button" className="btn-secondary" disabled={busy} onClick={()=>setPreview('')}>Cancel</button></>:<button type="button" className="btn-secondary" disabled={busy} onClick={()=>void submit()}>Invite {normalized} by email</button>}
  {message&&<p role="status">{message}</p>}
 </div>
}
