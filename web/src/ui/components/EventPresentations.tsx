import { SubmissionAttachmentPicker } from './SubmissionAttachments'
import { uploadSubmissionAttachment, type StagedSubmissionAttachment } from './submissionAttachments'
import { invalidatePublicOrganizationData } from '../../data/publicOrganization/cache'
import { TeamPeoplePicker, readTeamPeople, type TeamPerson } from './TeamPeoplePicker'
import { EventApplicationReview } from './EventApplicationReview'
import { useLocalFormDraft } from '../hooks/useLocalFormDraft'
import { formDraftKey } from '../hooks/localFormDraft'
import { useEffect, useId, useState } from 'react'
import './event-presentations.css'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'

type Org = { id:string; name:string; my_role?:string }
type Submission = { submission_id:string; organization_id:string; organization_name:string; title:string; summary:string; status:string; presenters:TeamPerson[] }
const emptyPresentationDraft = { submissionId: '', editing: '', presenting: 'manager', org: '', name: '', city: 'Baltimore', description: '', title: '', summary: '', people: '[]' }
export function EventPresentations({eventId}:{eventId:string}) {
 const {token,user}=useAuth()
 const [files,setFiles]=useState<StagedSubmissionAttachment[]>([])
 useEffect(()=>{setFiles([])},[eventId,user?.id])
 const location=useLocation()
 const fieldId=useId()
 const draft=useLocalFormDraft(formDraftKey(user?.id,`presentation:${encodeURIComponent(eventId)}`),emptyPresentationDraft)
 const {org,name,city,description,title,summary}=draft.value
 const people=readTeamPeople(draft.value.people)
 const setField=<K extends keyof typeof emptyPresentationDraft>(field:K,value:typeof emptyPresentationDraft[K])=>draft.setValue(previous=>({...previous,[field]:value}))
 const setOrg=(value:string)=>setField('org',value),setName=(value:string)=>setField('name',value),setCity=(value:string)=>setField('city',value),setDescription=(value:string)=>setField('description',value),setTitle=(value:string)=>setField('title',value),setSummary=(value:string)=>setField('summary',value)
 const base=`/api/org/api/network/events/${encodeURIComponent(eventId)}/presentations`
 const [tab,setTab]=useState<'applications'|'form'>('applications')
 const [enabled,setEnabled]=useState(false),[closed,setClosed]=useState(false),[ready,setReady]=useState(false)
 const [canReview,setCanReview]=useState(false),[orgs,setOrgs]=useState<Org[]>([]),[rows,setRows]=useState<Submission[]>([])
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[version,setVersion]=useState(0)
 async function request(url:string,method='GET',body?:unknown,signal?:AbortSignal) {
  const response=await fetch(url,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal,cache:'no-store'})
  const text=await response.text();let data;try{data=JSON.parse(text)}catch{throw new Error(response.ok?'Invalid response':text||'Unable to complete request')}
  if(!response.ok) throw new Error(data.message || data.detail || data.error || 'Unable to complete request')
  return data
 }
 useEffect(()=>{
  const controller=new AbortController();setReady(false);setRows([]);setOrgs([]);setCanReview(false)
  void (async()=>{try {
   const form=await request(`${base}/public`,'GET',undefined,controller.signal)
   let own:{canReview:boolean;submissions:Submission[]}={canReview:false,submissions:[]},teams:Org[]=[]
   if(token) [own,teams]=await Promise.all([request(base,'GET',undefined,controller.signal),request('/api/org/api/network/orgs?mine=true&limit=500','GET',undefined,controller.signal)])
   if(controller.signal.aborted)return
   setEnabled(form.enabled);setClosed(form.closed);setCanReview(own.canReview);setRows(own.submissions)
   setOrgs(teams.filter(o=>o.my_role==='owner'||o.my_role==='administrator'));setReady(true)
  }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'Unable to load applications')}})()
  return()=>controller.abort()
 // request uses only the token captured by this load.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[base,token,version])
 async function action(work:()=>Promise<void>) {
  if(busy)return;setBusy(true);setMessage('')
  try{await work();setVersion(v=>v+1)}catch(error){setMessage(error instanceof Error?error.message:'Unable to save')}finally{setBusy(false)}
 }
 if(!ready) return <section aria-label="Presentation applications"><p role="status">{message||'Loading presentation applications…'}</p>{message&&<button type="button" className="btn-secondary" onClick={()=>setVersion(v=>v+1)}>Retry</button>}</section>
 if(!enabled&&!canReview&&!rows.length)return <section className="portal-card" aria-label="Presentation applications"><h2>Applications</h2><p>Applications are not open for this event.</p></section>
 return <section className="portal-card presentation-applications" aria-label="Presentation applications">
  {canReview&&<div className="application-tabs" role="tablist" aria-label="Presentation management" onKeyDown={event=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
   event.preventDefault();const next=event.key==='Home'?'applications':event.key==='End'?'form':tab==='applications'?'form':'applications';setTab(next);document.getElementById(`${fieldId}-${next}-tab`)?.focus()
  }}>{(['applications','form'] as const).map(value=><button key={value} type="button" role="tab" id={`${fieldId}-${value}-tab`} aria-controls={`${fieldId}-${value}-panel`} aria-selected={tab===value} tabIndex={tab===value?0:-1} className={tab===value?'btn-primary':'btn-secondary'} onClick={()=>setTab(value)}>{value==='applications'?'Applications':'Team Form'}</button>)}</div>}
  {canReview&&tab==='applications'?<div role="tabpanel" id={`${fieldId}-applications-panel`} aria-labelledby={`${fieldId}-applications-tab`}><EventApplicationReview eventId={eventId} /></div>:<div {...(canReview?{role:'tabpanel',id:`${fieldId}-form-panel`,'aria-labelledby':`${fieldId}-form-tab`}:{})}>
  <div className="presentation-heading"><p className="public-event-eyebrow">Share your work</p><h2>Present at this event</h2><p className="muted">Bring your team’s ideas, research, or latest demo to the community.</p></div>
  {canReview&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>void action(async()=>{await request(`${base}/form`,'PUT',{enabled:!enabled})})}>{enabled?'Close applications':'Open applications'}</button>}
  {message&&<p role="status">{message}</p>}
  {enabled&&!closed&&!token&&<p><Link to={`/users/login?next=${encodeURIComponent(location.pathname+location.search+location.hash)}`}>Sign in</Link> to create a team and apply to present.</p>}
  {closed&&<p>Applications have closed for this event.</p>}
  {((enabled&&!closed)||draft.value.editing)&&token&&<form className="presentation-form local-form-draft" data-draft-saved={draft.saved} aria-label="Team presentation application" aria-busy={busy} onSubmit={e=>{e.preventDefault();void action(async()=>{
   let organizationId=org
   if(!organizationId){const team=await request('/api/org/api/network/orgs','POST',{name,city,description,kind:'team',acknowledgeOwnership:true});organizationId=team.id;setOrg(team.id);setOrgs(previous=>[...previous,team]);await invalidatePublicOrganizationData()}
   const presenters:({userId:string}|{invitationId:string})[]=[];
   if(draft.value.presenting==='presenter'&&user?.id)presenters.push({userId:user.id});
   for(const person of people){
    if(person.invitationId){presenters.push({invitationId:person.invitationId});continue}
    const resource=`/api/org/api/network/orgs/${encodeURIComponent(organizationId)}/${person.userId?'members':'invitations'}`
    const payload=person.userId?{user_id:person.userId,user_name:person.name,role:'member',add_only:true}:{email:person.email,purpose:'member'}
    try {
     const preview=await request(`${resource}/preview`,'POST',payload)
     const added=await request(`${resource}/apply`,'POST',{...payload,previewId:preview.previewId,...(!person.userId?{confirm:true}:{})});
     if(person.userId)presenters.push({userId:person.userId});else if(added.invitationId)presenters.push({invitationId:added.invitationId});else throw new Error('The invitation could not be linked to a presenter')
    }catch(error){throw new Error(`Your team is saved, but ${person.name} could not be added: ${error instanceof Error?error.message:'Please retry'}. Your draft is retained; submitting again safely retries the additions.`)}
   }
   const submissionId=draft.value.submissionId||crypto.randomUUID();setField('submissionId',submissionId);
   await request(`${base}/${encodeURIComponent(submissionId)}`,'PUT',{organization_id:organizationId,title,summary,presenters});
   setField('editing','true');
   try{for(const file of files){await uploadSubmissionAttachment(eventId,submissionId,file,token!);setFiles(previous=>previous.filter(item=>item.id!==file.id))}}catch(error){throw new Error(`Your application is saved, but an attachment could not upload: ${error instanceof Error?error.message:'Please retry'}. Your draft and remaining selected files are retained.`)}
   draft.clear();setMessage(draft.value.editing?'Application updated.':'Application submitted to the event organizers.')
  })}}>
   {draft.value.editing&&<div><h3>Edit application</h3><button type="button" className="btn-secondary" onClick={()=>{draft.clear();setFiles([])}}>Cancel editing</button></div>}
   <div className="local-draft-status"><p role="status">{draft.unavailable?'Local draft storage unavailable.':draft.saved?'Draft saved on this device.':'Draft not yet saved on this device.'}</p><button type="button" className="btn-secondary" onClick={()=>{draft.clear();setFiles([])}}>Clear saved draft</button></div>
   <p className="presentation-form-intro">You can submit multiple applications for the same team or organization, and edit each one afterwards. Updates return the application to pending review. Your team name, presentation title and summary will be publicly visible under Submissions. Submitting does not guarantee a presentation slot.</p>
   <label htmlFor={`${fieldId}-team`}>Team or organization</label><select id={`${fieldId}-team`} disabled={!!draft.value.editing} value={org} onChange={e=>{setOrg(e.target.value);setField('people','[]')}}><option value="">Create a team</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>
   {!org&&<><p className="muted">Creating a team gives you management access. Choose the presenters separately; you can create and manage a team for other people.</p><label>Team name<input required maxLength={255} value={name} onChange={e=>setName(e.target.value)}/></label><label>City<input required maxLength={80} value={city} onChange={e=>setCity(e.target.value)}/></label><div><label htmlFor={`${fieldId}-about`}>About your team</label><textarea id={`${fieldId}-about`} rows={3} maxLength={5000} value={description} onChange={e=>setDescription(e.target.value)}/></div></>}
   <label htmlFor={`${fieldId}-role`}>Your role in this presentation</label><select id={`${fieldId}-role`} value={draft.value.presenting} onChange={e=>setField('presenting',e.target.value)}><option value="manager">Team manager only</option><option value="presenter">Presenter and team manager</option></select>
   <p className="muted">Management access lets you submit and edit applications. Only selected presenters will appear on the submission.</p>
   <TeamPeoplePicker presenters people={people} onChange={value=>{setField('people',JSON.stringify(value.filter(person=>person.userId!==user?.id)));if(value.some(person=>person.userId===user?.id))setField('presenting','presenter')}} />
   <label>Presentation title<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label>
   <div><label htmlFor={`${fieldId}-summary`}>What will you present?</label><textarea id={`${fieldId}-summary`} rows={5} required maxLength={5000} value={summary} onChange={e=>setSummary(e.target.value)}/></div>
   <SubmissionAttachmentPicker files={files} onChange={setFiles} disabled={busy} />
   <div className="presentation-form-footer"><p className="muted">Your team name, presentation title and summary will be publicly visible.</p><button className="btn-primary presentation-submit" disabled={busy} type="submit">{busy?'Saving…':draft.value.editing?'Save changes':'Submit application'}</button></div>
  </form>}
  {rows.filter(r=>orgs.some(o=>o.id===r.organization_id)).length>0&&<><h3>Your applications</h3>{rows.filter(r=>orgs.some(o=>o.id===r.organization_id)).map(r=><article className="presentation-submission" key={r.submission_id}><h4>{r.organization_name}: {r.title}</h4><p style={{whiteSpace:'pre-wrap'}}>{r.summary}</p><p>Status: {r.status}</p><div><button type="button" className="btn-secondary" disabled={busy} onClick={()=>{draft.setValue({...emptyPresentationDraft,submissionId:r.submission_id,editing:'true',org:r.organization_id,title:r.title,summary:r.summary,presenting:r.presenters?.some(person=>person.userId===user?.id)?'presenter':'manager',people:JSON.stringify((r.presenters||[]).filter(person=>person.userId!==user?.id))});setFiles([])}}>Edit application</button><button type="button" className="btn-secondary" disabled={busy} onClick={()=>void action(async()=>{await request(`${base}/${encodeURIComponent(r.submission_id)}`,'DELETE');if(draft.value.submissionId===r.submission_id){draft.clear();setFiles([])}})}>Withdraw application</button></div></article>)}</>}

  </div>}
 </section>
}
