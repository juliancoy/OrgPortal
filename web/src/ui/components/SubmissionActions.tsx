import { useEffect, useId, useRef, useState } from 'react'
import Pencil from 'lucide-react/dist/esm/icons/pencil.mjs'
import Trash2 from 'lucide-react/dist/esm/icons/trash.mjs'
import { useAuth } from '../../app/AppProviders'
import type { PresentationApplication } from './EventPresentations'

export function SubmissionActions({eventId,application,onEdit,onDeleted}:{eventId:string;application:PresentationApplication;onEdit:(application:PresentationApplication)=>void;onDeleted:(submissionId:string)=>void}) {
 const {token}=useAuth(),id=useId(),dialog=useRef<HTMLDialogElement>(null)
 const [confirming,setConfirming]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{setConfirming(false);setError('')},[eventId,application.submission_id,token])
 useEffect(()=>{
  const modal=dialog.current
  if(!confirming||!modal)return
  modal.showModal();modal.querySelector<HTMLButtonElement>('[data-cancel-delete]')?.focus()
  return()=>{if(modal.open)modal.close()}
 },[confirming])
 async function remove(){
  if(busy||!token)return
  setBusy(true);setError('')
  try {
   const response=await fetch(`/api/org/api/network/events/${encodeURIComponent(eventId)}/presentations/${encodeURIComponent(application.submission_id)}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}})
   if(!response.ok)throw new Error('Could not delete this application. Please try again.')
   setConfirming(false);onDeleted(application.submission_id)
  }catch(reason){setError(reason instanceof Error?reason.message:'Could not delete this application.')}
  finally{setBusy(false)}
 }
 return <div className="application-row-actions">
  <button type="button" className="btn-secondary application-icon-action" aria-label="Edit application" title="Edit application" disabled={busy} onClick={()=>onEdit(application)}><Pencil size={18} aria-hidden="true" /></button>
  <button type="button" className="btn-secondary application-icon-action application-delete" aria-label="Delete application" title="Delete application" disabled={busy} onClick={()=>{setError('');setConfirming(true)}}><Trash2 size={18} aria-hidden="true" /></button>
  {confirming&&<dialog ref={dialog} className="application-delete-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event=>{event.preventDefault();if(!busy)setConfirming(false)}}>
   <h3 id={`${id}-title`}>Are you sure?</h3>
   <p id={`${id}-description`}>Delete “{application.title}”? This application will be removed from the event.</p>
   {error&&<p role="alert">{error}</p>}
   <div className="application-delete-dialog-actions">
    <button type="button" className="btn-secondary" data-cancel-delete disabled={busy} onClick={()=>setConfirming(false)}>Cancel</button>
    <button type="button" className="btn-secondary application-delete" disabled={busy} onClick={()=>void remove()}>{busy?'Deleting…':'Delete application'}</button>
   </div>
  </dialog>}
 </div>
}
