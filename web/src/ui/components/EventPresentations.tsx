import { useEffect, useState } from 'react'
import './event-presentations.css'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'

type Org = { id:string; name:string; my_role?:string }
type Submission = { organization_id:string; organization_name:string; title:string; summary:string; status:string }
export function EventPresentations({eventId}:{eventId:string}) {
 const {token}=useAuth()
 const base=`/api/org/api/network/events/${encodeURIComponent(eventId)}/presentations`
 const [enabled,setEnabled]=useState(false),[closed,setClosed]=useState(false),[ready,setReady]=useState(false)
 const [canReview,setCanReview]=useState(false),[orgs,setOrgs]=useState<Org[]>([]),[rows,setRows]=useState<Submission[]>([])
 const [org,setOrg]=useState(''),[name,setName]=useState(''),[city,setCity]=useState('Baltimore'),[description,setDescription]=useState('')
 const [ownsTeam,setOwnsTeam]=useState(false)
 const [title,setTitle]=useState(''),[summary,setSummary]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[version,setVersion]=useState(0)
 async function request(url:string,method='GET',body?:unknown,signal?:AbortSignal) {
  const response=await fetch(url,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal,cache:'no-store'})
  const data=await response.json()
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
 if(!enabled&&!canReview)return null
 return <section className="portal-card presentation-applications" aria-label="Presentation applications">
  <div className="presentation-heading"><p className="public-event-eyebrow">Share your work</p><h2>Present at this event</h2><p className="muted">Bring your team’s ideas, research, or latest demo to the LifeTech community.</p></div>
  {canReview&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>void action(async()=>{await request(`${base}/form`,'PUT',{enabled:!enabled})})}>{enabled?'Close applications':'Open applications'}</button>}
  {message&&<p role="status">{message}</p>}
  {enabled&&!closed&&!token&&<p><Link to={`/users/login?next=${encodeURIComponent(location.pathname)}`}>Sign in</Link> to create a team and apply to present.</p>}
  {closed&&<p>Applications have closed for this event.</p>}
  {enabled&&!closed&&token&&<form className="presentation-form" aria-label="Team presentation application" aria-busy={busy} onSubmit={e=>{e.preventDefault();void action(async()=>{
   let organizationId=org
   if(!organizationId){if(!ownsTeam)throw new Error('Confirm that you intend to manage the new team.');const team=await request('/api/org/api/network/orgs','POST',{name,city,description,kind:'team',acknowledgeOwnership:true});organizationId=team.id;setOrg(team.id);setOrgs(previous=>[...previous,team])}
   await request(`${base}/${encodeURIComponent(organizationId)}`,'PUT',{title,summary});setMessage('Application submitted to the event organizers.')
  })}}>
   <p className="presentation-form-intro">Apply on behalf of a team or organization you manage. Your proposal is visible to its managers and the event organizers. Submitting does not guarantee a presentation slot.</p>
   <label>Team or organization<select value={org} onChange={e=>{setOrg(e.target.value);const saved=rows.find(r=>r.organization_id===e.target.value);setTitle(saved?.title||'');setSummary(saved?.summary||'')}}><option value="">Create a team</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
   {!org&&<><label className="presentation-ownership"><input type="checkbox" required checked={ownsTeam} onChange={e=>setOwnsTeam(e.target.checked)}/>I intend to manage this team and understand my account will receive owner access.</label><label>Team name<input required maxLength={255} value={name} onChange={e=>setName(e.target.value)}/></label><label>City<input required maxLength={80} value={city} onChange={e=>setCity(e.target.value)}/></label><label>About your team<textarea rows={3} maxLength={5000} value={description} onChange={e=>setDescription(e.target.value)}/></label></>}
   <label>Presentation title<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label>
   <label>What will you present?<textarea rows={5} required maxLength={5000} value={summary} onChange={e=>setSummary(e.target.value)}/></label>
   <div className="presentation-form-footer"><p className="muted">Only your team’s managers and the event organizers can see this proposal.</p><button className="btn-primary presentation-submit" disabled={busy} type="submit">{busy?'Submitting…':'Submit application'}</button></div>
  </form>}
  {rows.length>0&&<><h3>{canReview?'Review applications':'Your applications'}</h3>{rows.map(r=><article className="presentation-submission" key={r.organization_id}><h4>{r.organization_name}: {r.title}</h4><p style={{whiteSpace:'pre-wrap'}}>{r.summary}</p><p>Status: {r.status}</p>{canReview?<div>{['accepted','declined','submitted'].map(status=><button type="button" className="btn-secondary" key={status} disabled={busy||r.status===status} onClick={()=>void action(async()=>{await request(`${base}/${encodeURIComponent(r.organization_id)}`,'PATCH',{status})})}>{status==='accepted'?'Accept':status==='declined'?'Decline':'Mark pending'}</button>)}</div>:<button type="button" className="btn-secondary" disabled={busy} onClick={()=>void action(async()=>{await request(`${base}/${encodeURIComponent(r.organization_id)}`,'DELETE')})}>Withdraw application</button>}</article>)}</>}
 </section>
}
