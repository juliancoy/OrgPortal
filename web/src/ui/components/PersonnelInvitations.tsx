import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../app/AppProviders'
import { personnelSchemes, type PersonnelScheme } from '../../../../shared/organizationPersonnel'

type Invitation={id:string;email:string;status:string;email_status:string;delivery_blocker:string|null;attempts:number;intent?:{scheme:PersonnelScheme;classes:string[];access:string}|null}
type Relationship={user_id:string;user_name:string;scheme:PersonnelScheme;class_key:string;status:string}
export function PersonnelInvitations({organizationId,scheme}:{organizationId:string;scheme:PersonnelScheme}){
 const {token}=useAuth(),[email,setEmail]=useState(''),[classes,setClasses]=useState<string[]>([]),[access,setAccess]=useState<'none'|'member'>('none'),[invitations,setInvitations]=useState<Invitation[]>([]),[relationships,setRelationships]=useState<Relationship[]>([]),[evidence,setEvidence]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 const [review,setReview]=useState<{path:string;payload:Record<string,unknown>;previewId:string;effect:string}|null>(null)
 const base=`/api/org/api/network/orgs/${encodeURIComponent(organizationId)}`
 const request=useCallback(async(path:string,body?:Record<string,unknown>)=>{
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},cache:'no-store',...(body?{body:JSON.stringify(body)}:{})})
  const data=await response.json();if(!response.ok)throw new Error(data.error||data.detail||'Could not update personnel invitations');return data
 },[base,token])
 const load=useCallback(async()=>{const data=await request('/invitations');setInvitations(data.invitations);setRelationships(data.relationships)},[request])
 useEffect(()=>{setReview(null);setClasses([]);setEmail('');setInvitations([]);setRelationships([]);setError('');void load().catch(reason=>setError(reason.message))},[load,scheme])
 async function prepare(path:string,payload:Record<string,unknown>,effect:string){
  setBusy(true);setError('');setMessage('');setReview(null)
  try{const result=await request(path+'/preview',payload);setReview({path,payload,previewId:result.previewId,effect:result.effect||effect})}catch(reason){setError(reason instanceof Error?reason.message:'Could not preview invitation')}finally{setBusy(false)}
 }
 async function apply(){
  if(!review)return;setBusy(true);setError('')
  try{await request(review.path+'/apply',{...review.payload,previewId:review.previewId,confirm:true});setReview(null);setMessage('Personnel update saved.');await load();window.dispatchEvent(new CustomEvent('organization-member-titles-updated',{detail:{organizationId}}))}catch(reason){setReview(null);setError(reason instanceof Error?reason.message:'Could not save personnel update')}finally{setBusy(false)}
 }
 const label=(selected:PersonnelScheme,key:string)=>(personnelSchemes[selected].classes as Record<string,{label:string}>)[key]?.label||key
 return <details className="organization-personnel-invitations"><summary>Personnel invitations and status</summary>
  <form onSubmit={event=>{event.preventDefault();void prepare('/invitations',{email,purpose:access==='member'?'member':'volunteer',intent:{scheme,classes,access}},`Invite ${email}`)}}>
   <label>Personnel invitation email<input type="email" required value={email} onChange={event=>{setEmail(event.target.value);setReview(null)}} /></label>
   <fieldset><legend>{personnelSchemes[scheme].label}</legend>{Object.entries(personnelSchemes[scheme].classes).filter(([key])=>!['public','persona_non_grata'].includes(key)).map(([key,value])=><label key={key}><input type="checkbox" checked={classes.includes(key)} onChange={event=>{setClasses(previous=>event.target.checked?[...previous,key]:previous.filter(item=>item!==key));setReview(null)}} />{value.label}</label>)}</fieldset>
   <label>Invitation portal access<select aria-label="Invitation portal access" value={access} onChange={event=>{setAccess(event.target.value as 'none'|'member');setReview(null)}}><option value="none">No membership access</option><option value="member">Member access</option></select></label>
   <p>Acceptance publishes these relationships. Board, executive, employment, and shareholder classes await organizer confirmation with supporting evidence. Existing access roles remain.</p>
   <button type="submit" disabled={busy||!classes.length}>Review personnel invitation</button>
  </form>
  <button type="button" disabled={busy} onClick={()=>void load().then(()=>window.dispatchEvent(new CustomEvent('organization-invitations-updated',{detail:{organizationId}}))).catch(reason=>setError(reason.message))}>Refresh invitation status</button>
  <ul aria-label="Personnel invitation status">{invitations.map(invitation=><li key={invitation.id}><strong>{invitation.email}</strong> · {invitation.status} · email: {invitation.email_status} · attempts: {invitation.attempts}{invitation.delivery_blocker&&<> · blocked: {invitation.delivery_blocker.replaceAll('_',' ')}</>}{invitation.intent&&<> · {invitation.intent.classes.map(key=>label(invitation.intent!.scheme,key)).join(', ')} · {invitation.intent.access==='member'?'member access':'no membership access'}</>}
   {invitation.status==='pending'&&<button type="button" disabled={busy} onClick={()=>void prepare(`/invitations/${invitation.id}/cancel`,{},`Cancel the pending invitation to ${invitation.email}`)}>Cancel invitation</button>}
  </li>)}</ul>
  <p>Email “sent” means the provider accepted it; inbox delivery is not confirmed.</p>
  {!!relationships.length&&<><h3>Accepted personnel relationships</h3><label>Supporting evidence URL<input type="url" value={evidence} onChange={event=>{setEvidence(event.target.value);setReview(null)}} placeholder="https://…" /></label>
   <ul>{relationships.map(person=><li key={`${person.user_id}:${person.scheme}:${person.class_key}`}>{person.user_name} · {label(person.scheme,person.class_key)} · {person.status.replaceAll('_',' ')}
    {person.status==='pending_confirmation'&&<button type="button" disabled={busy||!evidence.startsWith('https://')} onClick={()=>void prepare('/relationships',{userId:person.user_id,scheme:person.scheme,classKey:person.class_key,action:'confirm',evidenceUrl:evidence},`Confirm ${person.user_name} as ${label(person.scheme,person.class_key)} using ${evidence}`)}>Review class confirmation</button>}
    <button type="button" disabled={busy} onClick={()=>void prepare('/relationships',{userId:person.user_id,scheme:person.scheme,classKey:person.class_key,action:'revoke'},`Remove ${person.user_name}’s ${label(person.scheme,person.class_key)} relationship`)}>Review relationship removal</button>
   </li>)}</ul></>}
  {review&&<section aria-label="Review personnel invitation update"><p>{review.effect}</p><button type="button" disabled={busy} onClick={()=>void apply()}>Confirm personnel invitation update</button><button type="button" disabled={busy} onClick={()=>setReview(null)}>Cancel review</button></section>}
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 </details>
}
