import { useEffect, useState } from 'react'
import { useAuth } from '../../app/AppProviders'
import { personnelSchemes, type PersonnelScheme } from '../../../../shared/organizationPersonnel'

export function usePersonnelScheme(organizationId: string) {
 const [state,setState]=useState<{organizationId:string;scheme:PersonnelScheme|null;error:string}>({organizationId,scheme:null,error:''})
 useEffect(()=>{
  const controller=new AbortController()
  const load=()=>{void fetch(`/api/org/api/network/orgs/${encodeURIComponent(organizationId)}/personnel/scheme`,{signal:controller.signal,cache:'no-store'}).then(async response=>{
   if(!response.ok)throw new Error('Could not load personnel settings.')
   const data=await response.json();if(!Object.hasOwn(personnelSchemes,data.scheme))throw new Error('Unknown personnel class scheme.')
   if(!controller.signal.aborted)setState({organizationId,scheme:data.scheme,error:''})
  }).catch(error=>{if(!controller.signal.aborted)setState({organizationId,scheme:null,error:error.message})})}
  setState({organizationId,scheme:null,error:''});load();window.addEventListener('organization-personnel-scheme-updated',load)
  return()=>{controller.abort();window.removeEventListener('organization-personnel-scheme-updated',load)}
 },[organizationId])
 return state.organizationId===organizationId?state:{organizationId,scheme:null,error:''}
}

export function OrganizationPersonnelScheme({organizationId,canManage,scheme}:{organizationId:string;canManage:boolean;scheme:PersonnelScheme}) {
 const {token}=useAuth(),[choice,setChoice]=useState<PersonnelScheme>(scheme),[preview,setPreview]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 useEffect(()=>{setChoice(scheme);setPreview('')},[scheme,organizationId])
 useEffect(()=>setMessage(''),[organizationId])
 async function save(){
  setBusy(true);setMessage('')
  try{
   const response=await fetch(`/api/org/api/network/orgs/${encodeURIComponent(organizationId)}/personnel/scheme/${preview?'apply':'preview'}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({scheme:choice,...(preview?{previewId:preview,confirm:true}:{})})})
   const data=await response.json();if(!response.ok)throw new Error(data.error||data.detail||'Could not save class scheme')
   if(preview){setPreview('');setMessage('Class scheme saved.');window.dispatchEvent(new Event('organization-personnel-scheme-updated'))}else setPreview(data.previewId)
  }catch(error){setPreview('');setMessage(error instanceof Error?error.message:'Could not save class scheme')}finally{setBusy(false)}
 }
 return <section className="personnel-scheme-settings" aria-label="Personnel class scheme"><p>Currently using: <strong>{personnelSchemes[scheme].label}</strong></p>{canManage&&<>
  <label className="personnel-field">Organization class scheme<select aria-label="Organization class scheme" value={choice} disabled={busy} onChange={event=>{setChoice(event.target.value as PersonnelScheme);setPreview('');setMessage('')}}>{Object.entries(personnelSchemes).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label>
  {choice!==scheme&&!preview&&<p className="muted">Not saved. Invitations still use {personnelSchemes[scheme].label} until you confirm this change.</p>}
  {preview&&<p>Use {personnelSchemes[choice].label} for this organization. Existing role assignments remain; access permissions are unchanged.</p>}
  <button type="button" className="btn-secondary" disabled={busy||choice===scheme} onClick={()=>void save()}>{preview?'Confirm class scheme':'Review class scheme'}</button>
 </>}{message&&<p role="status">{message}</p>}</section>
}
