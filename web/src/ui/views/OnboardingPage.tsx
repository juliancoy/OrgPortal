import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'
import { signalTasksChanged, useTaskQueue } from '../tasks/TaskQueue'
import { readAvailabilityDraft, writeAvailabilityDraft, clearAvailabilityDraft } from './availabilityDraft'
import './availability.css'
import './onboarding.css'

type Step = { id: string; title: string; description: string; href: string }
type Onboarding = { enabled: boolean; organizationName: string; start_date: string; end_date: string; completed_at: string | null; availability_saved_at: string | null; acknowledgements: Record<string,string>; steps: Step[] }
type Calendar = { start:string; end:string; timezone:string; slots:string[]; selected:string[]; suggested_slots:string[] }
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
async function request(token:string|null,path='',init:RequestInit={}) {
 const send=(auth:string|null)=>fetch(`/api/org/api/onboarding${path}`,{...init,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})}})
 let response=await send(token)
 if(response.status===401){const refreshed=await refreshRuntimeTokenFromSession();if(refreshed)response=await send(refreshed)}
 if(!response.ok)throw new Error((await response.text())||'Unable to update onboarding.')
 return response.json()
}
export function OnboardingBanner() {
 const queue=useTaskQueue()
 const task=queue.tasks.find(task=>task.href?.startsWith('/onboarding'))
 return task ? <aside className="onboarding-banner"><strong>{task.title}</strong><span>Complete your onboarding tasks, starting with when you can meet.</span><Link to={task.href!}>Continue onboarding</Link></aside> : null
}
export function OnboardingPage() {
 const {token,user}=useAuth()
 const {hash}=useLocation()
 const [data,setData]=useState<Onboarding|null>(null),[calendar,setCalendar]=useState<Calendar|null>(null)
 const [selected,setSelected]=useState(new Set<string>()),[dirty,setDirty]=useState(false)
 const selectionRef=useRef(new Set<string>()),saveQueue=useRef(Promise.resolve()),[saving,setSaving]=useState(false),[retry,setRetry]=useState(0)
 const [showDates,setShowDates]=useState(false)
 const [showOvernight,setShowOvernight]=useState(false)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 useEffect(()=>{
  let active=true
  setData(null);setCalendar(null);setSelected(new Set());setError('');setDirty(false)
  if(token&&user)void request(token).then(async d=>{
   if(!active)return
   setData(d)
   if(d.enabled){const c=await request(token,`/availability?timezone=${encodeURIComponent(timezone)}`);if(active){const draft=readAvailabilityDraft(user!.id,c.start,timezone,c.slots);setCalendar(c);selectionRef.current=new Set(draft??c.selected);setSelected(selectionRef.current);setDirty(draft!==null)}}
  }).catch(e=>{if(active)setError(e.message)})
  return()=>{active=false}
 },[user?.id,!!token])
 useEffect(()=>{
  if(!data?.enabled||!calendar||!hash)return
  document.getElementById(hash.slice(1))?.scrollIntoView({block:'start'})
 },[hash,data,calendar])
 async function save(path:string,body:unknown,method='POST') {
  setBusy(true);setError('');setMessage('')
  try {await request(token,path,{method,body:JSON.stringify(body)});if(path==='/availability'&&user&&calendar){clearAvailabilityDraft(user.id,calendar.start,timezone);setDirty(false)}setData(await request(token));signalTasksChanged();setMessage(path==='/availability'?'Availability saved to your account. You can update it here anytime.':'Progress saved.')}catch(e){setError(e instanceof Error?e.message:'Unable to save.')}finally{setBusy(false)}
 }
 useEffect(()=>{
  if(!dirty||!calendar||!user||!token)return
  const snapshot=[...selected],userId=user.id,start=calendar.start
  const timer=setTimeout(()=>{
   saveQueue.current=saveQueue.current.then(async()=>{
    setSaving(true);setError('')
    try{
     await request(token,'/availability',{method:'PUT',body:JSON.stringify({timezone,slots:snapshot,reviewed:true})})
     if(snapshot.length===selectionRef.current.size&&snapshot.every(slot=>selectionRef.current.has(slot))){clearAvailabilityDraft(userId,start,timezone);setDirty(false)}
     setData(await request(token));signalTasksChanged()
    }catch(e){setError(e instanceof Error?e.message:'Unable to save availability. Your draft is kept in this browser.');setRetry(value=>value+1)}
    finally{setSaving(false)}
   })
  },retry?Math.min(30000,retry*5000):150)
  return()=>clearTimeout(timer)
 },[dirty,selected,calendar,user?.id,token,retry])
 const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'})
 const timeFormat=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
 const weekdayFormat=new Intl.DateTimeFormat(undefined,{timeZone:timezone,weekday:'short'})
 const optionalDateFormat=new Intl.DateTimeFormat(undefined,{timeZone:timezone,month:'short',day:'numeric'})
 const days:Record<string,string[]>={}
 for(const slot of calendar?.slots||[]){const day=dateFormat.format(new Date(slot));(days[day]??=[]).push(slot)}
 const allDays=Object.keys(days),visible=allDays.slice(0,7)
 const dayLabel=(day:string)=>{const date=new Date(days[day]![0]);return `${weekdayFormat.format(date)}${showDates?` (${optionalDateFormat.format(date)})`:''}`}
 const slotVisible=(slot:string)=>{const time=timeFormat.format(new Date(slot));return showOvernight||(time>='08:00'&&time<'23:00')}
 const times=Array.from({length:48},(_,i)=>`${String(Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`).filter(time=>showOvernight||(time>='08:00'&&time<'23:00'))
 function toggle(slots:string[]) {const next=new Set(selected),add=!slots.every(s=>next.has(s));for(const s of slots){if(add)next.add(s);else next.delete(s)}selectionRef.current=next;setSelected(next);setDirty(true);setMessage('');setRetry(0);if(user&&calendar)writeAvailabilityDraft(user.id,calendar.start,timezone,[...next])}
 const completed=data ? data.steps.filter(s=>data.acknowledgements[s.id]).length+Number(!!data.availability_saved_at) : 0
 return <section className="availability-page onboarding-page">
  <h1>{data?.organizationName||'Community'} onboarding</h1>
  {!token&&<p><Link to="/users/login?next=%2Fonboarding">Sign in</Link> to start your onboarding.</p>}
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {token&&!data&&!error&&<p>Loading onboarding…</p>}
  {data&&!data.enabled&&<p>This portal does not have an onboarding flow enabled.</p>}
  {data?.enabled&&<>
   <p>Set your availability, then complete the two introductions below.</p>
   <p role="status"><strong>{data.completed_at?'Onboarding complete':`${completed} of ${data.steps.length+1} steps complete`}</strong></p>
   <progress value={completed} max={data.steps.length+1} aria-label="Onboarding progress" />
   <section id="availability" className="onboarding-calendar">
    <h2>When can you meet? {data.availability_saved_at?'✓':''}</h2>
    <p>Select the times you’re usually free in {timezone}. Changes save automatically. Unselected times mean unavailable; update your week anytime.</p>
    {calendar&&<>
     {calendar.suggested_slots.length>0&&<p>Some selections are suggestions from your saved history. Review them before saving.</p>}
     <label><input type="checkbox" checked={showDates} onChange={e=>setShowDates(e.target.checked)}/>Show dates</label>
     <label><input type="checkbox" checked={showOvernight} onChange={e=>setShowOvernight(e.target.checked)}/>Show 11 pm–8 am</label>
     <div className="availability-grid-wrap"><table className="availability-grid"><caption>Your availability in {timezone}. Day and time buttons toggle visible times in their column or row.</caption><thead><tr><th>Time</th>{visible.map(day=><th key={day} scope="col"><button disabled={busy} onClick={()=>toggle(days[day]!.filter(slotVisible))} aria-label={`Toggle visible times on ${dayLabel(day)}`}>{dayLabel(day)}</button></th>)}</tr></thead><tbody>{times.map(time=><tr key={time}><th scope="row"><button disabled={busy} onClick={()=>toggle(visible.flatMap(day=>days[day]!.filter(s=>timeFormat.format(new Date(s))===time)))}>{time}</button></th>{visible.map(day=><td key={day}>{days[day]!.filter(s=>timeFormat.format(new Date(s))===time).map(slot=><button key={slot} disabled={busy} aria-pressed={selected.has(slot)} aria-label={`${dayLabel(day)} ${time}, ${selected.has(slot)?'available':'unavailable'}, UTC ${slot.slice(11,16)}`} onClick={()=>toggle([slot])}>{selected.has(slot)?'✓':'·'}</button>)}</td>)}</tr>)}</tbody></table></div>
     <button disabled={busy} onClick={()=>{selectionRef.current=new Set();setSelected(new Set());setDirty(true);setRetry(0);if(user&&calendar)writeAvailabilityDraft(user.id,calendar.start,timezone,[])}}>Clear week</button>
     <p>{selected.size} half-hour slots selected for your typical week.</p>
     <p role="status">{error&&dirty?'Changes not saved yet. Retrying; your draft is kept in this browser.':dirty||saving?'Saving changes…':data.availability_saved_at?'Saved to your account.':'Select a time to start. Changes save automatically.'}</p>
     <p><Link to="/availability">Open When I Meet scheduling polls</Link> · <Link to="/meetings">Manage member meeting bookings</Link></p>
    </>}
   </section>
   <details className="onboarding-checklist"><summary>Finish onboarding · {data.steps.filter(s=>data.acknowledgements[s.id]).length} of {data.steps.length} complete</summary><ol className="onboarding-steps">{data.steps.map(step=><li key={step.id} id={step.id}>
    <h2>{step.title}</h2><p>{step.description}</p>
    <a href={step.href} target={step.href.startsWith('https:')?'_blank':undefined} rel="noreferrer">Open resource{step.href.startsWith('https:')?' (new tab)':''}</a>
    {data.acknowledgements[step.id]?<p>✓ Confirmed</p>:<button disabled={busy} onClick={()=>void save(`/steps/${step.id}`,{acknowledged:true})}>I have completed this step</button>}
   </li>)}</ol></details>
   <details className="onboarding-organizers"><summary>Becoming an organizer</summary><p>Discuss this path with an existing organizer. The Constitution describes relevant skills, regular attendance, two organizer meetings, and a two-thirds admission vote. Organizers then record onboarding, add the person to the website, and arrange appropriate access. An inaugural eMCee role is encouraged.</p><p>This checklist does not grant an organizer role or system permissions. An organizer must verify the prerequisites and use the existing membership and access tools.</p><a href={data.steps.find(step=>step.id==='constitution')?.href||'https://codecollective.us/constitution'}>Read organizer eligibility and responsibilities</a></details>
  </>}
 </section>
}
