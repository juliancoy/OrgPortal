import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/AppProviders'
import { personnelSchemes, type PersonnelScheme } from '../../../../shared/organizationPersonnel'

type Invitation={id:string;email:string;status:string;email_status:string;delivery_blocker:string|null;attempts:number;intent?:{scheme:PersonnelScheme;classes:string[];access:string;roleNames?:Record<string,string>}|null}
type Relationship={user_id:string;user_name:string;scheme:PersonnelScheme;class_key:string;status:string;role_name?:string|null}
export function PersonnelInvitations({organizationId,scheme}:{organizationId:string;scheme:PersonnelScheme}){
 const {token}=useAuth(),[email,setEmail]=useState(''),[classes,setClasses]=useState<string[]>([]),[access,setAccess]=useState<'none'|'member'>('none'),[invitations,setInvitations]=useState<Invitation[]>([]),[relationships,setRelationships]=useState<Relationship[]>([]),[evidence,setEvidence]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 const [review,setReview]=useState<{path:string;payload:Record<string,unknown>;previewId:string;effect:string}|null>(null)
 const [formOpen,setFormOpen]=useState(false),[roleNames,setRoleNames]=useState<Record<string,string>>({})
 const reviewRef=useRef<HTMLElement>(null)
 useEffect(()=>{if(review)reviewRef.current?.focus()},[review])
 const base=`/api/org/api/network/orgs/${encodeURIComponent(organizationId)}`
 const request=useCallback(async(path:string,body?:Record<string,unknown>)=>{
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},cache:'no-store',...(body?{body:JSON.stringify(body)}:{})})
  const data=await response.json();if(!response.ok)throw new Error(data.error||data.detail||'Could not update personnel invitations');return data
 },[base,token])
 const load=useCallback(async()=>{const data=await request('/invitations');setInvitations(data.invitations);setRelationships(data.relationships)},[request])
 useEffect(()=>{setReview(null);setClasses([]);setRoleNames({});setEmail('');setInvitations([]);setRelationships([]);setError('');void load().catch(reason=>setError(reason.message))},[load,scheme])
 async function prepare(path:string,payload:Record<string,unknown>,effect:string){
  setBusy(true);setError('');setMessage('');setReview(null)
  try{const result=await request(path+'/preview',payload);setReview({path,payload,previewId:result.previewId,effect:result.effect||effect})}catch(reason){setError(reason instanceof Error?reason.message:'Could not preview invitation')}finally{setBusy(false)}
 }
 async function apply(){
  if(!review)return;setBusy(true);setError('')
  try{await request(review.path+'/apply',{...review.payload,previewId:review.previewId,confirm:true});setReview(null);setFormOpen(false);setEmail('');setClasses([]);setRoleNames({});setMessage(review.path==='/invitations'?'Invitation queued.':'Change saved.');await load();window.dispatchEvent(new CustomEvent('organization-member-titles-updated',{detail:{organizationId}}))}catch(reason){setReview(null);setError(reason instanceof Error?reason.message:'Could not save personnel update')}finally{setBusy(false)}
 }
 const label=(selected:PersonnelScheme,key:string)=>(personnelSchemes[selected].classes as Record<string,{label:string}>)[key]?.label||key
 const blockerMessage=(reason:string|null)=>({sending_disabled:'Email sending is off for this portal. This invitation has not been sent.',sender_unavailable_or_cooling_down:'A connected email sender is needed, or the sender is cooling down.',daily_limit:'The daily sending limit was reached. Delivery will resume later.',sender_reconnect_required:'Reconnect the sender’s email account.',sender_busy:'Waiting for the sender to finish another message.',inviter_permission:'The inviter no longer has permission to send this invitation.'} as Record<string,string>)[reason||'']||''
 const statusLabel=(invitation:Invitation)=>invitation.status!=='pending'?invitation.status.replaceAll('_',' '):invitation.email_status==='sent'?'Sent · Awaiting acceptance':invitation.email_status==='queued'?'Waiting to send':invitation.email_status==='failed'?'Email failed':invitation.email_status==='uncertain'?'Delivery needs checking':'Pending'
 return <section className="organization-personnel-invitations" aria-label="Personnel invitations">
  <div className="personnel-invite-toolbar"><button type="button" className="btn-primary" aria-expanded={formOpen} onClick={()=>{setFormOpen(value=>!value);setReview(null)}}>{formOpen?'Close invitation':'Invite a person'}</button><span className="muted">{personnelSchemes[scheme].label}</span></div>
  {formOpen&&<form className="personnel-invite-form" onSubmit={event=>{event.preventDefault();void prepare('/invitations',{email,intent:{scheme,classes,access,roleNames:Object.fromEntries(classes.filter(key=>roleNames[key]?.trim()).map(key=>[key,roleNames[key].trim()]))}},`Invite ${email}`)}}>
   <h2>Invite a person</h2>
   <label className="personnel-field">Email address<input aria-label="Personnel invitation email" type="email" required autoFocus autoComplete="email" placeholder="name@example.com" value={email} onChange={event=>{setEmail(event.target.value);setReview(null)}} /></label>
   <fieldset className="personnel-role-options"><legend>Choose their role</legend><p className="muted">Select a class, then give it a specific title if needed.</p><div className="personnel-role-grid">{Object.entries(personnelSchemes[scheme].classes).filter(([key])=>!['public','persona_non_grata'].includes(key)).map(([key,value])=><div className={`personnel-role-option${classes.includes(key)?' is-selected':''}`} key={key}>
    <label className="personnel-role-check"><input type="checkbox" checked={classes.includes(key)} onChange={event=>{setClasses(previous=>event.target.checked?[...previous,key]:previous.filter(item=>item!==key));setReview(null)}} /><span>{value.label}</span></label>
    {classes.includes(key)&&<label className="personnel-field personnel-role-title"><span>Display title <small className="muted">optional</small></span><input aria-label={`Display title for ${value.label}`} type="text" maxLength={100} value={roleNames[key]||''} placeholder={value.label} onChange={event=>{setRoleNames(previous=>({...previous,[key]:event.target.value}));setReview(null)}} /></label>}
   </div>)}</div></fieldset>
   <label className="personnel-field">Portal access<select aria-label="Invitation portal access" value={access} onChange={event=>{setAccess(event.target.value as 'none'|'member');setReview(null)}}><option value="none">No membership access</option><option value="member">Member access</option></select></label>
   <p className="personnel-form-help">They must accept before appearing publicly. Titles do not grant access. Board, executive, employment and ownership classes also need organizer confirmation.</p>
   <div className="personnel-actions"><button type="submit" className="btn-primary" disabled={busy||!classes.length}>Review invitation</button><button type="button" className="btn-secondary" disabled={busy} onClick={()=>{setFormOpen(false);setReview(null)}}>Cancel</button></div>
  </form>}
  {review&&<section className="personnel-review" ref={reviewRef} tabIndex={-1} aria-label="Review personnel invitation update"><h3>Review change</h3><p>{review.effect}</p><div className="personnel-actions"><button type="button" className="btn-primary" disabled={busy} onClick={()=>void apply()}>Confirm</button><button type="button" className="btn-secondary" disabled={busy} onClick={()=>setReview(null)}>Back</button></div></section>}
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <details className="personnel-invitation-history"><summary>Invitation history{invitations.some(item=>item.status==='pending')?` · ${invitations.filter(item=>item.status==='pending').length} pending`:''}</summary>
   <div className="personnel-history-heading"><p className="muted">Sent means accepted by the email provider; inbox delivery is not confirmed.</p><button type="button" className="btn-secondary" disabled={busy} onClick={()=>void load().then(()=>window.dispatchEvent(new CustomEvent('organization-invitations-updated',{detail:{organizationId}}))).catch(reason=>setError(reason.message))}>Refresh</button></div>
   {!invitations.length&&<p className="muted">No invitations yet.</p>}
   <ul className="personnel-status-list" aria-label="Personnel invitation status">{invitations.map(invitation=><li key={invitation.id}><div className="personnel-status-heading"><strong>{invitation.email}</strong><span className="pill">{statusLabel(invitation)}</span></div>
    {invitation.intent&&<p className="muted">{invitation.intent.classes.map(key=>invitation.intent!.roleNames?.[key]||label(invitation.intent!.scheme,key)).join(', ')} · {invitation.intent.access==='member'?'Member access':'No membership access'}</p>}
    {invitation.status==='pending'&&blockerMessage(invitation.delivery_blocker)&&<p className="personnel-delivery-notice">{blockerMessage(invitation.delivery_blocker)}</p>}
    <div className="personnel-actions"><details className="personnel-delivery-details"><summary>Delivery details</summary><dl><dt>Email status</dt><dd>{invitation.email_status}</dd><dt>Attempts</dt><dd>{invitation.attempts}</dd></dl></details>
    {invitation.status==='pending'&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>void prepare(`/invitations/${invitation.id}/cancel`,{},`Cancel the pending invitation to ${invitation.email}`)}>Cancel invitation</button>}</div>
   </li>)}</ul>
  </details>
  {!!relationships.length&&<details className="personnel-relationship-tools"><summary>Manage assigned relationships{relationships.some(person=>person.status==='pending_confirmation')?` · ${relationships.filter(person=>person.status==='pending_confirmation').length} need confirmation`:''}</summary>
   {relationships.some(person=>person.status==='pending_confirmation')&&<label className="personnel-field">Supporting evidence URL<input type="url" value={evidence} onChange={event=>{setEvidence(event.target.value);setReview(null)}} placeholder="https://…" /></label>}
   <ul className="personnel-status-list">{relationships.map(person=><li key={`${person.user_id}:${person.scheme}:${person.class_key}`}><div className="personnel-status-heading"><strong>{person.user_name}</strong><span className="pill">{person.status==='pending_confirmation'?'Needs confirmation':'Active'}</span></div><p>{person.role_name||label(person.scheme,person.class_key)}</p><div className="personnel-actions">
    {person.status==='pending_confirmation'&&<button type="button" className="btn-primary" disabled={busy||!evidence.startsWith('https://')} onClick={()=>void prepare('/relationships',{userId:person.user_id,scheme:person.scheme,classKey:person.class_key,action:'confirm',evidenceUrl:evidence},`Confirm ${person.user_name} as ${person.role_name||label(person.scheme,person.class_key)} using ${evidence}`)}>Review confirmation</button>}
    <button type="button" className="btn-secondary" disabled={busy} onClick={()=>void prepare('/relationships',{userId:person.user_id,scheme:person.scheme,classKey:person.class_key,action:'revoke'},`Remove ${person.user_name}’s ${person.role_name||label(person.scheme,person.class_key)} relationship`)}>Remove relationship</button>
   </div></li>)}</ul>
  </details>}
 </section>
}
