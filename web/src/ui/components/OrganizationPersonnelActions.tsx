import { PortalPersonPicker } from './PortalPersonPicker'
import { useLocalFormDraft } from '../hooks/useLocalFormDraft'
import { formDraftKey } from '../hooks/localFormDraft'
import { useEffect, useState } from 'react'
import { useAuth } from '../../app/AppProviders'

type Motion = { id:string;target_user_id:string;decision:string;status:string;voting_deadline:string|null;proposer_id:string }
type Change = { path:string; payload:Record<string,unknown> }
const emptyPersonnelDraft={target:'',query:'',targetName:'',targetEmail:'',decision:'exclude',note:'',fairReview:false}
export function OrganizationPersonnelActions({organizationId,canManage}:{organizationId:string;canManage:boolean}) {
 const {token,user}=useAuth()
 const draft=useLocalFormDraft(formDraftKey(user?.id,`personnel:${encodeURIComponent(organizationId)}`),emptyPersonnelDraft)
 const {target,decision,note,fairReview}=draft.value
 const setField=<K extends keyof typeof emptyPersonnelDraft>(field:K,value:typeof emptyPersonnelDraft[K])=>draft.setValue(previous=>({...previous,[field]:value}))
 const setDecision=(value:string)=>setField('decision',value),setNote=(value:string)=>setField('note',value),setFairReview=(value:boolean)=>setField('fairReview',value)
 const base=`/api/org/api/network/orgs/${encodeURIComponent(organizationId)}/personnel`
 const [motions,setMotions]=useState<Motion[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[revision,setRevision]=useState(0)
 const [review,setReview]=useState<(Change & {previewId:string})|null>(null)
 async function request(path:string,payload?:Record<string,unknown>) {
  const response=await fetch(base+path,{method:payload?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{}),cache:'no-store'})
  const data=await response.json();if(!response.ok)throw new Error(data.error||data.detail||'Could not update personnel status');return data
 }
 useEffect(()=>{
  setReview(null);setMotions([]);setMessage('')
 },[organizationId,token])
 useEffect(()=>{
  if(!canManage||!token)return
  const controller=new AbortController()
  void fetch(base+'/motions',{headers:{Authorization:`Bearer ${token}`},signal:controller.signal,cache:'no-store'})
   .then(async r=>{if(!r.ok)throw new Error('Could not load restricted personnel motions');return r.json()})
   .then(data=>{if(!controller.signal.aborted)setMotions(data.motions)})
   .catch(error=>{if(!controller.signal.aborted)setMessage(error.message)})
  return()=>controller.abort()
 },[base,canManage,token,revision])
 async function prepare(change:Change) {
  setBusy(true);setMessage('');setReview(null)
  try{const data=await request(change.path+'/preview',change.payload);setReview({...change,previewId:data.previewId})}
  catch(error){setMessage(error instanceof Error?error.message:'Could not prepare status update')}
  finally{setBusy(false)}
 }
 async function apply() {
  if(!review)return;setBusy(true);setMessage('')
  try{await request(review.path+'/apply',{...review.payload,previewId:review.previewId,confirm:true});setReview(null);draft.clear();setRevision(v=>v+1);setMessage('Personnel update recorded.');window.dispatchEvent(new Event('organization-access-change'))}
  catch(error){setReview(null);setMessage(error instanceof Error?error.message:'Could not save status update')}
  finally{setBusy(false)}
 }
 return <details className="organization-personnel-actions"><summary>Participation status</summary>
  <div className="organization-personnel-controls local-form-draft" data-draft-saved={draft.saved}>
   <div className="local-draft-status"><p role="status">{draft.unavailable?'Local draft storage unavailable.':draft.saved?'Draft saved on this device.':'Draft not yet saved on this device.'}</p><button type="button" className="btn-secondary" onClick={draft.clear}>Clear saved draft</button></div>
   <PortalPersonPicker organizationId={organizationId} query={draft.value.query} selected={target?{userId:target,name:draft.value.targetName,email:draft.value.targetEmail}:null}
    onQueryChange={query=>{draft.setValue(previous=>({...previous,query,target:'',targetName:'',targetEmail:''}));setReview(null)}}
    onSelect={person=>{draft.setValue(previous=>({...previous,target:person.user_id,targetName:person.user_name,targetEmail:person.email||'',query:person.user_name}));setReview(null)}} />
   <p className="muted">Any active member can recognize a volunteer. Awards last three months. An RSVP establishes Attendee status for upcoming events and events in the last three months; Member and Organizer take precedence. Stakeholders are derived from membership in benefactor or beneficiary organizations.</p>
   <div className="organization-personnel-buttons"><button className="btn-secondary" type="button" disabled={busy||!target.trim()} onClick={()=>void prepare({path:'/volunteers',payload:{targetUserId:target.trim(),action:'award'}})}>Award Volunteer status</button>
   <button className="btn-secondary" type="button" disabled={busy||!target.trim()} onClick={()=>void prepare({path:'/volunteers',payload:{targetUserId:target.trim(),action:'revoke'}})}>Revoke volunteer award</button></div>
   {canManage&&<details><summary>Restricted conduct ballots</summary>
    <p>Only organizers can read these records or vote. Persona Non Grata requires a second, recorded fair review and notice, a ballot of at least 24 hours, and a majority vote with organizer quorum. Reapplication is considered after two years.</p>
    <label>Decision<select value={decision} onChange={e=>setDecision(e.target.value)}><option value="exclude">Persona Non Grata</option><option value="readmit">Readmission after exclusion</option></select></label>
    <button className="btn-secondary" type="button" disabled={busy||!target.trim()} onClick={()=>void prepare({path:'/motions',payload:{action:'propose',targetUserId:target.trim(),decision}})}>Propose personnel motion</button>
    <label>Chair’s procedural record<textarea rows={3} value={note} maxLength={2000} onChange={e=>setNote(e.target.value)} placeholder="Record notice to all organizers, the exact question, completed debate and the fair-review process. Keep sensitive allegations outside this note." /></label>
    <label className="organization-personnel-check"><input type="checkbox" checked={fairReview} onChange={e=>setFairReview(e.target.checked)} />The subject had a fair opportunity to respond; organizer notice and debate are complete.</label>
    {motions.map(motion=><article className="organization-personnel-motion" key={motion.id}><h4>{motion.decision==='exclude'?'Persona Non Grata':'Readmission'} · {motion.target_user_id}</h4><p>{motion.status}{motion.voting_deadline?` · Ballot closes ${new Date(motion.voting_deadline).toLocaleString()}`:''}</p>
     <div className="organization-personnel-buttons">
     {motion.status==='proposed'&&<><button className="btn-secondary" disabled={busy} type="button" onClick={()=>void prepare({path:'/motions',payload:{action:'second',motionId:motion.id}})}>Second motion</button><button className="btn-secondary" disabled={busy} type="button" onClick={()=>void prepare({path:'/motions',payload:{action:'withdraw',motionId:motion.id}})}>Withdraw motion</button></>}
     {motion.status==='discussion'&&<button className="btn-secondary" disabled={busy||!fairReview||note.trim().length<20} type="button" onClick={()=>void prepare({path:'/motions',payload:{action:'open-voting',motionId:motion.id,procedureNote:note.trim(),fairReviewCompleted:fairReview}})}>Open organizer ballot</button>}
     {motion.status==='voting'&&<>{(['yea','nay','abstain'] as const).map(choice=><button className="btn-secondary" disabled={busy||!!motion.voting_deadline&&Date.parse(motion.voting_deadline)<=Date.now()} type="button" key={choice} onClick={()=>void prepare({path:'/motions',payload:{action:'vote',motionId:motion.id,choice}})}>{choice==='yea'?'Vote yes':choice==='nay'?'Vote no':'Abstain'}</button>)}<button className="btn-secondary" disabled={busy||!motion.voting_deadline||Date.parse(motion.voting_deadline)>Date.now()} type="button" onClick={()=>void prepare({path:'/motions',payload:{action:'resolve',motionId:motion.id}})}>Resolve ballot</button></>}
     </div></article>)}
   </details>}
   {review&&<section aria-label="Review personnel update"><h4>Review personnel update</h4><p>{String(review.payload.action)} · {String(review.payload.targetUserId||review.payload.motionId)}{review.payload.decision?` · ${review.payload.decision}`:''}{review.payload.choice?` · ${review.payload.choice}`:''}</p>
    {Boolean(review.payload.procedureNote)&&<p>{String(review.payload.procedureNote)}</p>}
    <button className="btn-primary" disabled={busy} type="button" onClick={()=>void apply()}>Confirm personnel update</button>{' '}<button className="btn-secondary" disabled={busy} type="button" onClick={()=>setReview(null)}>Cancel</button></section>}
   {message&&<p role="status">{message}</p>}
  </div>
 </details>
}
