import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'
import { signalTasksChanged, useTaskQueue } from '../tasks/TaskQueue'
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
 const {token}=useAuth()
 const {hash}=useLocation()
 const [data,setData]=useState<Onboarding|null>(null),[calendar,setCalendar]=useState<Calendar|null>(null)
 const [selected,setSelected]=useState(new Set<string>()),[week,setWeek]=useState(0),[reviewed,setReviewed]=useState(false)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 useEffect(()=>{
  let active=true
  setData(null);setCalendar(null);setSelected(new Set());setError('');setReviewed(false)
  if(token)void request(token).then(async d=>{
   if(!active)return
   setData(d)
   if(d.enabled){const c=await request(token,`/availability?timezone=${encodeURIComponent(timezone)}`);if(active){setCalendar(c);setSelected(new Set(c.selected))}}
  }).catch(e=>{if(active)setError(e.message)})
  return()=>{active=false}
 },[token])
 useEffect(()=>{
  if(!data?.enabled||!calendar||!hash)return
  document.getElementById(hash.slice(1))?.scrollIntoView({block:'start'})
 },[hash,data,calendar])
 async function save(path:string,body:unknown,method='POST') {
  setBusy(true);setError('');setMessage('')
  try {await request(token,path,{method,body:JSON.stringify(body)});setData(await request(token));signalTasksChanged();setMessage('Progress saved.')}catch(e){setError(e instanceof Error?e.message:'Unable to save.')}finally{setBusy(false)}
 }
 const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'})
 const timeFormat=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
 const days:Record<string,string[]>={}
 for(const slot of calendar?.slots||[]){const day=dateFormat.format(new Date(slot));(days[day]??=[]).push(slot)}
 const allDays=Object.keys(days),visible=allDays.slice(week*7,week*7+7)
 const times=Array.from({length:48},(_,i)=>`${String(Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`)
 function toggle(slots:string[]) {setReviewed(false);setSelected(previous=>{const next=new Set(previous),add=!slots.every(s=>next.has(s));for(const s of slots){if(add)next.add(s);else next.delete(s)}return next})}
 const completed=data ? data.steps.filter(s=>data.acknowledgements[s.id]).length+Number(!!data.availability_saved_at) : 0
 return <section className="availability-page onboarding-page">
  <h1>{data?.organizationName||'Community'} onboarding</h1>
  {!token&&<p><Link to="/users/login?next=%2Fonboarding">Sign in</Link> to start your onboarding.</p>}
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {token&&!data&&!error&&<p>Loading onboarding…</p>}
  {data&&!data.enabled&&<p>This portal does not have an onboarding flow enabled.</p>}
  {data?.enabled&&<>
   <p>Complete each required step. Your progress is saved to your account.</p>
   <p role="status"><strong>{data.completed_at?'Onboarding complete':`${completed} of ${data.steps.length+1} steps complete`}</strong></p>
   <progress value={completed} max={data.steps.length+1} aria-label="Onboarding progress" />
   <section id="availability" className="onboarding-calendar">
    <h2>Indicate your meeting availability for the next month {data.availability_saved_at?'✓':''}</h2>
    <p>Review {data.start_date} through the day before {data.end_date}, in {timezone}. Mark available half-hours; unselected times mean unavailable. Review every week before saving. You can save no available times if that is accurate.</p>
    {calendar&&<>
     {calendar.suggested_slots.length>0&&<p>Some selections are suggestions from your saved history. Review them before saving.</p>}
     <div className="availability-toolbar"><button disabled={week===0||busy} onClick={()=>setWeek(w=>w-1)}>Previous week</button><span>Week {week+1} of {Math.ceil(allDays.length/7)}</span><button disabled={(week+1)*7>=allDays.length||busy} onClick={()=>setWeek(w=>w+1)}>Next week</button></div>
     <div className="availability-grid-wrap"><table className="availability-grid"><caption>Your availability in {timezone}. Day and time buttons toggle their entire column or row.</caption><thead><tr><th>Time</th>{visible.map(day=><th key={day} scope="col"><button disabled={busy} onClick={()=>toggle(days[day]!)} aria-label={`Toggle all times on ${day}`}>{day.slice(5)}</button></th>)}</tr></thead><tbody>{times.map(time=><tr key={time}><th scope="row"><button disabled={busy} onClick={()=>toggle(visible.flatMap(day=>days[day]!.filter(s=>timeFormat.format(new Date(s))===time)))}>{time}</button></th>{visible.map(day=><td key={day}>{days[day]!.filter(s=>timeFormat.format(new Date(s))===time).map(slot=><button key={slot} disabled={busy} aria-pressed={selected.has(slot)} aria-label={`${day} ${time}, ${selected.has(slot)?'available':'unavailable'}, UTC ${slot.slice(11,16)}`} onClick={()=>toggle([slot])}>{selected.has(slot)?'✓':'·'}</button>)}</td>)}</tr>)}</tbody></table></div>
     <p>{selected.size} half-hour slots selected for the month.</p>
     <label className="onboarding-review"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed the whole month, including the times left unavailable.</label>
     <button disabled={busy||!reviewed} onClick={()=>void save('/availability',{timezone,slots:[...selected],reviewed:true},'PUT')}>Save month availability</button>
    </>}
   </section>
   <ol className="onboarding-steps">{data.steps.map(step=><li key={step.id} id={step.id}>
    <h2>{step.title}</h2><p>{step.description}</p>
    <a href={step.href} target={step.href.startsWith('https:')?'_blank':undefined} rel="noreferrer">Open resource{step.href.startsWith('https:')?' (new tab)':''}</a>
    {data.acknowledgements[step.id]?<p>✓ Confirmed</p>:<button disabled={busy} onClick={()=>void save(`/steps/${step.id}`,{acknowledged:true})}>I have completed this step</button>}
   </li>)}</ol>
   <details className="onboarding-organizers"><summary>Becoming an organizer</summary><p>Discuss this path with an existing organizer. The draft calls for relevant skills, regular attendance, two organizer meetings, and a two-thirds admission vote. Organizers then record onboarding, add the person to the website, and arrange appropriate access. An inaugural eMCee role is encouraged.</p><p>This checklist does not grant an organizer role or system permissions. An organizer must verify the prerequisites and use the existing membership and access tools.</p><a href="https://codecollective.us/constitution" target="_blank" rel="noreferrer">Read organizer eligibility and responsibilities</a></details>
  </>}
 </section>
}
