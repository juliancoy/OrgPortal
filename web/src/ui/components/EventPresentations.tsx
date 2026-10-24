import { SubmissionAttachmentPicker } from './SubmissionAttachments'
import { uploadSubmissionAttachment, type StagedSubmissionAttachment } from './submissionAttachments'
import { invalidatePublicOrganizationData } from '../../data/publicOrganization/cache'
import { TeamPeoplePicker, readTeamPeople, type TeamPerson } from './TeamPeoplePicker'
import { useLocalFormDraft } from '../hooks/useLocalFormDraft'
import { formDraftKey } from '../hooks/localFormDraft'
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import './event-presentations.css'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'

type Org = { id:string; name:string; my_role?:string }
export type PresentationApplication = { submission_id:string; organization_id:string; organization_name:string; title:string; summary:string; status:string; presenters:TeamPerson[] }
export type PresentationFormAction = { kind: 'edit'; application: PresentationApplication } | { kind: 'delete'; submissionId: string }
const emptyPresentationDraft = { submissionId: '', editing: '', imageOrg: '', imageUrl: '', org: '', name: '', city: 'Baltimore', description: '', title: '', summary: '', people: '[]' }
export function EventPresentations({eventId,formAction,onActionHandled,onSaved,onSubmitted,onCancelEdit}:{eventId:string;formAction?:PresentationFormAction|null;onActionHandled?:()=>void;onSaved?:()=>void;onSubmitted?:(submissionId:string)=>void;onCancelEdit?:()=>void}) {
 const {token,user}=useAuth()
 const [teamImage,setTeamImage]=useState<File|null>(null)
 const [imagePreview,setImagePreview]=useState('')
 useEffect(()=>{if(!teamImage){setImagePreview('');return}const url=URL.createObjectURL(teamImage);setImagePreview(url);return()=>URL.revokeObjectURL(url)},[teamImage])
 const [files,setFiles]=useState<StagedSubmissionAttachment[]>([])
 useEffect(()=>{setFiles([]);setTeamImage(null)},[eventId,user?.id])
 const location=useLocation()
 const fieldId=useId()
 const draft=useLocalFormDraft(formDraftKey(user?.id,`presentation:${encodeURIComponent(eventId)}`),emptyPresentationDraft)
 const {org,name,city,description,title,summary}=draft.value
 useEffect(()=>{
  if(!formAction)return
  if(formAction.kind==='edit'){
   const application=formAction.application
   draft.setValue(previous=>previous.submissionId===application.submission_id&&previous.org===application.organization_id&&previous.editing?previous:{...emptyPresentationDraft,submissionId:application.submission_id,editing:'true',org:application.organization_id,title:application.title,summary:application.summary,people:JSON.stringify(application.presenters||[])})
   setFiles([])
  }else if(draft.value.submissionId===formAction.submissionId){draft.clear();setFiles([]);setTeamImage(null)}
  onActionHandled?.()
 // Consume each parent action once; draft setters are recreated on each render.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[formAction,user?.id])
 const people=readTeamPeople(draft.value.people)
 const setField=<K extends keyof typeof emptyPresentationDraft>(field:K,value:typeof emptyPresentationDraft[K])=>draft.setValue(previous=>({...previous,[field]:value}))
 const setOrg=(value:string)=>setField('org',value),setName=(value:string)=>setField('name',value),setCity=(value:string)=>setField('city',value),setDescription=(value:string)=>setField('description',value),setTitle=(value:string)=>setField('title',value),setSummary=(value:string)=>setField('summary',value)
 const base=`/api/org/api/network/events/${encodeURIComponent(eventId)}/presentations`
 const [enabled,setEnabled]=useState(false),[closed,setClosed]=useState(false),[ready,setReady]=useState(false)
 const [orgs,setOrgs]=useState<Org[]>([])
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[version,setVersion]=useState(0)
 const messageRef=useRef<HTMLParagraphElement>(null)
 useEffect(()=>{if(message)messageRef.current?.focus()},[message])
 async function request(url:string,method='GET',body?:unknown,signal?:AbortSignal) {
  const response=await fetch(url,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal,cache:'no-store'})
  const text=await response.text();let data;try{data=JSON.parse(text)}catch{throw new Error(response.ok?'Invalid response':text||'Unable to complete request')}
  if(!response.ok) throw new Error(data.message || data.detail || data.error || 'Unable to complete request')
  return data
 }
 useEffect(()=>{
  const controller=new AbortController();setReady(false);setOrgs([])
  void (async()=>{try {
   const form=await request(`${base}/public`,'GET',undefined,controller.signal)
   let teams:Org[]=[]
   if(token) teams=await request('/api/org/api/network/orgs?mine=true&limit=500','GET',undefined,controller.signal)
   if(controller.signal.aborted)return
   setEnabled(form.enabled);setClosed(form.closed);
   setOrgs(teams.filter(o=>o.my_role==='owner'||o.my_role==='administrator'));setReady(true)
  }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'Unable to load applications')}})()
  return()=>controller.abort()
 // request uses only the token captured by this load.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[base,token,version])
 useEffect(()=>{
  if(!token)return
  let cancelled=false
  if(!org){
   if(!people.length&&user?.id)draft.setValue(previous=>({...previous,people:JSON.stringify([{userId:user.id,name:user.fullName||'You',existing:true}])}))
   return
  }
  void request(`${base}/team/${encodeURIComponent(org)}`).then(data=>{if(!cancelled)draft.setValue(previous=>({...previous,people:JSON.stringify([...data.people.map((person:TeamPerson)=>({...person,existing:true})),...readTeamPeople(previous.people).filter(person=>!person.existing&&!data.people.some((member:TeamPerson)=>(member.userId&&member.userId===person.userId)||(member.invitationId&&member.invitationId===person.invitationId)))])}))}).catch(error=>{if(!cancelled)setMessage(error.message)})
  return()=>{cancelled=true}
 // The organization owns this roster; staged additions remain in the local draft.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[org,token,eventId,people.length===0])
 function chooseTeamImage(event:ChangeEvent<HTMLInputElement>) {
  const file=event.target.files?.[0]
  if(!file){setTeamImage(null);return}
  if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>8*1024*1024){
   setMessage('Choose a JPEG, PNG, WebP or GIF image up to 8 MB.');event.target.value='';return
  }
  setTeamImage(file);setField('imageUrl','');setMessage('')
 }
 async function action(work:()=>Promise<void>) {
  if(busy)return;setBusy(true);setMessage('')
  try{await work();setVersion(v=>v+1)}catch(error){setMessage(error instanceof Error?error.message:'Unable to save')}finally{setBusy(false)}
 }
 if(!ready) return <section aria-label="Presentation applications"><p role="status">{message||'Loading application…'}</p>{message&&<button type="button" className="btn-secondary" onClick={()=>setVersion(v=>v+1)}>Retry</button>}</section>
 if(!enabled&&!draft.value.editing)return <p role="status">Presentation applications are not available for this event.</p>
 return <section className="presentation-applications" aria-label="Presentation applications">
  {message&&<p className="application-message" ref={messageRef} tabIndex={-1} role="alert">{message}</p>}
  {enabled&&!closed&&!token&&<div className="presentation-login"><p>Sign in to submit with an existing organization or create a new team.</p><Link className="btn-primary" to={`/users/login?next=${encodeURIComponent(location.pathname+location.search)}`}>Sign in to apply</Link></div>}
  {closed&&<p>Applications have closed for this event.</p>}
  {((enabled&&!closed)||draft.value.editing)&&token&&<form className="presentation-form" data-draft-saved={draft.saved} aria-label="Team presentation application" aria-busy={busy} onSubmit={e=>{e.preventDefault();void action(async()=>{
   if(!people.length)throw new Error('Add at least one teammate before submitting.')
   let organizationId=org
   if(!organizationId){const team=await request('/api/org/api/network/orgs','POST',{name,city,description,kind:'team',acknowledgeOwnership:true});organizationId=team.id;setOrg(team.id);if(teamImage)setField('imageOrg',team.id);setOrgs(previous=>[...previous,team]);await invalidatePublicOrganizationData()}
   if((teamImage||draft.value.imageUrl)&&(!org||draft.value.imageOrg===organizationId)){
    let imageUrl=draft.value.imageUrl;
    if(!imageUrl&&teamImage){
    const imageForm=new FormData();imageForm.set('image',teamImage);
    const response=await fetch(`/api/org/api/network/orgs/${encodeURIComponent(organizationId)}/media`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:imageForm});
    const uploaded=await response.json();if(!response.ok)throw new Error(uploaded.message||uploaded.error||'Your team is saved, but its image could not upload. Retry to finish.');
    const media=uploaded.media?.at(-1);if(!media?.url)throw new Error('The uploaded team image is unavailable.');
    imageUrl=new URL(media.url.startsWith('/api/network/')?`/api/org${media.url}`:media.url,window.location.origin).href;setField('imageUrl',imageUrl);
    }
    await request(`/api/org/api/network/orgs/${encodeURIComponent(organizationId)}`,'PATCH',{image_url:imageUrl});
    setTeamImage(null);setField('imageOrg','');setField('imageUrl','');await invalidatePublicOrganizationData();
   }
   for(const person of people){
    if(person.existing||person.userId===user?.id||person.invitationId)continue
    const resource=`/api/org/api/network/orgs/${encodeURIComponent(organizationId)}/${person.userId?'members':'invitations'}`
    const payload=person.userId?{user_id:person.userId,user_name:person.name,role:'member',add_only:true}:{email:person.email,purpose:'member'}
    try {
     const preview=await request(`${resource}/preview`,'POST',payload)
     const added=await request(`${resource}/apply`,'POST',{...payload,previewId:preview.previewId,...(!person.userId?{confirm:true}:{})});
     if(!person.userId&&!added.invitationId)throw new Error('The teammate invitation could not be saved')
    }catch(error){throw new Error(`Your team is saved, but ${person.name} could not be added: ${error instanceof Error?error.message:'Please retry'}. Your draft is retained; submitting again safely retries the additions.`)}
   }
   const submissionId=draft.value.submissionId||crypto.randomUUID();setField('submissionId',submissionId);
   await request(`${base}/${encodeURIComponent(submissionId)}`,'PUT',{organization_id:organizationId,title,summary});
   setField('editing','true');
   try{for(const file of files){await uploadSubmissionAttachment(eventId,submissionId,file,token!);setFiles(previous=>previous.filter(item=>item.id!==file.id))}}catch(error){throw new Error(`Your application is saved, but an attachment could not upload: ${error instanceof Error?error.message:'Please retry'}. Your draft and remaining selected files are retained.`)}finally{onSaved?.()}
   draft.clear();setMessage(draft.value.editing?'Application updated.':'Application submitted to the event organizers.');onSubmitted?.(submissionId)
  })}}>
   <div className="local-draft-status"><p role="status" aria-live="polite">{busy?'Saving your application…':draft.unavailable?'Draft storage is unavailable. Keep this page open until you submit.':draft.saved?'Draft saved on this device.':'Saving draft on this device…'}</p>{draft.value.editing&&<button type="button" disabled={busy} className="btn-secondary" onClick={()=>{draft.clear();setFiles([]);setTeamImage(null);onCancelEdit?.()}}>Cancel editing</button>}</div>
   <fieldset className="presentation-fields" disabled={busy}><legend className="sr-only">Application details</legend>
    <fieldset className="presentation-section"><legend>Presentation</legend>
     <label>Presentation title<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label>
     <div><label htmlFor={`${fieldId}-summary`}>Abstract</label><textarea id={`${fieldId}-summary`} aria-describedby={`${fieldId}-summary-help`} rows={6} required maxLength={5000} value={summary} onChange={e=>setSummary(e.target.value)}/><p className="muted" id={`${fieldId}-summary-help`}>Describe your work and what you plan to present. Up to 5,000 characters.</p></div>
    </fieldset>
    <fieldset className="presentation-section"><legend>Team &amp; organization</legend>
     <div className="presentation-team-choice"><label htmlFor={`${fieldId}-team`}>Applying as</label>
      <select id={`${fieldId}-team`} disabled={!!draft.value.editing} value={org} onChange={e=>{setOrg(e.target.value);setField('people','[]')}}>
       <option value="">Create a new team</option>
       {!!orgs.length&&<optgroup label="Your existing organizations">{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>}
      </select>
     </div>
     {!org&&<><div className="presentation-team-fields"><label>Team name<input required maxLength={255} value={name} onChange={e=>setName(e.target.value)}/></label><label>City<input required maxLength={80} value={city} onChange={e=>setCity(e.target.value)}/></label></div>
      <details className="application-optional-profile"><summary>Team profile (optional)</summary><div className="application-profile-fields"><div><label htmlFor={`${fieldId}-about`}>About your team</label><textarea id={`${fieldId}-about`} rows={3} maxLength={5000} value={description} onChange={e=>setDescription(e.target.value)}/></div>
       <label>Team image<input aria-label="Team image (optional)" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseTeamImage}/><small>Your organization’s main image. JPEG, PNG, WebP or GIF, up to 8 MB.</small>{imagePreview&&<img src={imagePreview} alt="Team image preview" style={{maxWidth:160,maxHeight:160,objectFit:'contain'}}/>}</label>
      </div></details></>}
     {org&&draft.value.imageOrg===org&&<label>Team image (optional)<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseTeamImage}/>{imagePreview&&<img src={imagePreview} alt="Team image preview" style={{maxWidth:160,maxHeight:160,objectFit:'contain'}}/>}</label>}
     <TeamPeoplePicker compact people={people} onChange={value=>draft.setValue(previous=>({...previous,people:JSON.stringify(value)}))}/>
     <p className="muted">Members are shared across your organization’s submissions. New email invitations are sent when you submit.{org&&<> <Link to={`/orgs/${encodeURIComponent(org)}?tab=personnel`}>Manage members</Link>.</>}</p>
    </fieldset>
    <fieldset className="presentation-section"><legend>Supporting materials <span className="application-optional">(optional)</span></legend>
     <p className="muted">Slides, images or documents. Up to 10 files, 20 MB each. Attachments are public.</p>
     <SubmissionAttachmentPicker files={files} onChange={setFiles} disabled={busy} buttonLabel="Add files"/>
    </fieldset>
   </fieldset>
   <div className="presentation-form-footer"><p className="muted">Your team name, presentation title, abstract and attachments will be public. The community can explore and vote on your submission.</p>
    <button className="btn-primary presentation-submit" disabled={busy} type="submit">{busy?'Saving application…':draft.value.editing?'Save changes':'Submit application'}</button>
    <button type="button" className="btn-secondary" disabled={busy} onClick={()=>{draft.clear();setFiles([]);setTeamImage(null)}}>Clear saved draft</button>
   </div>
  </form>}
 </section>
}
