import { PollInvitations } from '../tasks/PollInvitations'
import { signalTasksChanged } from '../tasks/TaskQueue'
import { useEffect, useRef, useState } from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'
import './availability.css'
type Poll = { id:string; title:string; timezone:string; slots:string[]; closed:boolean; participants:number; invited_count:number; access:'link'; counts:Record<string,number> }
type Summary = Pick<Poll,'id'|'title'|'closed'>
const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
export function AvailabilityPage() {
 const { id } = useParams(), navigate=useNavigate(), {token}=useAuth()
 const [poll,setPoll]=useState<Poll|null>(null),[polls,setPolls]=useState<Summary[]>([]),[selected,setSelected]=useState<Set<string>>(new Set()),[owner,setOwner]=useState(false)
 const [suggested,setSuggested]=useState<Set<string>>(new Set())
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[zone,setZone]=useState(browserZone)
 const [title,setTitle]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState(''),[from,setFrom]=useState('09:00'),[until,setUntil]=useState('17:00')
 const painting=useRef<{kind:'day'|'time'|'cell';available:boolean}|null>(null), suppressClick=useRef<HTMLButtonElement|null>(null)
 useEffect(()=>{const stop=()=>{painting.current=null};window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',stop);window.addEventListener('blur',stop);return()=>{window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);window.removeEventListener('blur',stop)}},[])
 async function request(path:string, init:RequestInit={}, authenticated=false) {
  const send=(auth?:string|null)=>fetch(`/api/org/api/availability${path}`,{...init,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})}})
  let response=await send(authenticated?token:undefined)
  if(authenticated && response.status===401){const refreshed=await refreshRuntimeTokenFromSession();if(refreshed)response=await send(refreshed)}
  const text=await response.text();let body: Record<string, unknown>;try{body=JSON.parse(text)}catch{body={detail:text}}
  if(!response.ok)throw new Error(String(body.detail||body.message||body.error||'Unable to complete this request.'))
  return body
 }
 useEffect(()=>{
  let active=true
  setError('');setPoll(null);setSelected(new Set());setOwner(false);setSuggested(new Set())
  const load=async()=>{
   if(id){const p=await request(`/${id}`);if(!active)return;setPoll(p as Poll);if(token){const me=await request(`/${id}/me?timezone=${encodeURIComponent(browserZone)}`,{},true);if(active){setSelected(new Set(me.slots as string[]));setSuggested(new Set(me.suggested_slots as string[]));setOwner(Boolean(me.is_owner))}}}
   else if(token){const p=await request('',{},true);if(active)setPolls(p.polls as Summary[])}
  }
  load().catch(e=>{if(active)setError(e.message)})
  return()=>{active=false}
 // The route and identity determine which poll and response are loaded.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[id,token])
 async function run(action:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await action()}catch(e){setError(e instanceof Error?e.message:'Request failed.')}finally{setBusy(false)}}
 function setSlots(slots:string[],available:boolean){setSuggested(previous=>{const next=new Set(previous);for(const slot of slots)next.delete(slot);return next});setSelected(previous=>{const next=new Set(previous);for(const slot of slots){if(available)next.add(slot);else next.delete(slot)}return next})}
 function slotControls(slots:string[],kind:'day'|'time'|'cell'){
  return {
   onPointerDown:(e:PointerEvent<HTMLButtonElement>)=>{if(e.pointerType==='mouse'&&e.button===0){e.preventDefault();suppressClick.current=e.currentTarget;const available=!slots.every(slot=>selected.has(slot));painting.current={kind,available};setSlots(slots,available)}},
   onPointerEnter:(e:PointerEvent<HTMLButtonElement>)=>{const paint=painting.current;if(e.pointerType==='mouse'&&e.buttons===1&&paint?.kind===kind&&!e.currentTarget.disabled)setSlots(slots,paint.available)},
   onClick:(e:MouseEvent<HTMLButtonElement>)=>{if(e.detail!==0&&suppressClick.current===e.currentTarget){suppressClick.current=null;return}suppressClick.current=null;setSlots(slots,!slots.every(slot=>selected.has(slot)))}
  }
 }
 function selectionState(slots:string[]):boolean|'mixed'{return slots.every(slot=>selected.has(slot))?true:slots.some(slot=>selected.has(slot))?'mixed':false}
 async function create(){
  const first=new Date(`${start}T${from}`), lastDay=new Date(`${end}T00:00`)
  if(!title.trim() || !start || !end || !Number.isFinite(first.getTime()) || lastDay<new Date(`${start}T00:00`) || lastDay.getTime()-new Date(`${start}T00:00`).getTime()>13*86400000 || from>=until)throw new Error('Choose a title, up to 14 days, and an ending time after the starting time.')
  const slots:string[]=[]
  for(let day=new Date(`${start}T00:00`);day<=lastDay;day.setDate(day.getDate()+1)){
   const date=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`
   const limit=new Date(`${date}T${until}`).getTime()
   for(let time=new Date(`${date}T${from}`).getTime();time<limit;time+=1800000)slots.push(new Date(time).toISOString())
  }
  const result=await request('',{method:'POST',body:JSON.stringify({title,timezone:browserZone,slots})},true);navigate(`/availability/${result.id}`)
 }
 const dateFormat=new Intl.DateTimeFormat(undefined,{timeZone:zone,weekday:'short',month:'short',day:'numeric'})
 const weekdayFormat=new Intl.DateTimeFormat(undefined,{timeZone:zone,weekday:'short'})
 const numericDateFormat=new Intl.DateTimeFormat(undefined,{timeZone:zone,month:'numeric',day:'numeric'})
 const weekendFormat=new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short'})
 const isWeekend=(slot:string)=>['Sat','Sun'].includes(weekendFormat.format(new Date(slot)))
 const timeFormat=new Intl.DateTimeFormat(undefined,{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
 const days:Record<string,string[]>={}
 for(const slot of poll?.slots||[]){const day=dateFormat.format(new Date(slot));(days[day] ||= []).push(slot)}
 const times=[...new Set((poll?.slots||[]).map(s=>timeFormat.format(new Date(s))))].sort()
 const best=poll?Math.max(0,...Object.values(poll.counts)):0
 return <main className="availability-page">
  <header><p>PLAN TOGETHER</p><h1>{poll?.title||'Find a time that works.'}</h1><p>Share an availability poll, mark your half-hour slots, and see where the group overlaps.</p><Link to="/availability">My availability polls</Link></header>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {!token&&<p><Link to={`/users/login?next=${encodeURIComponent(id?`/availability/${id}`:'/availability')}`}>Sign in</Link> to create a poll or save your availability. Overlap counts are public; individual responses are private.</p>}
  {!id&&token&&<><form onSubmit={e=>{e.preventDefault();void run(create)}} className="availability-create"><h2>Create a group poll</h2><label>Poll title<input required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Next LifeTech meetup" /></label><label>First date<input required type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Last date<input required type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label><label>From<input required type="time" step={1800} value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Until<input required type="time" step={1800} value={until} onChange={e=>setUntil(e.target.value)}/></label><p>Times use your device timezone: <strong>{browserZone}</strong>. Each selected day uses these hours. Maximum 14 days.</p><button disabled={busy}>Create poll</button></form><h2>Your polls</h2><ul>{polls.map(p=><li key={p.id}><Link to={`/availability/${p.id}`}>{p.title}</Link>{p.closed?' · Closed':''}</li>)}</ul></>}
  {poll&&<>
   <div className="availability-toolbar"><label>Display timezone (device default)<select value={zone} onChange={e=>setZone(e.target.value)}>{[browserZone,poll.timezone,'UTC',...Intl.supportedValuesOf('timeZone')].filter((v,i,a)=>a.indexOf(v)===i).map(z=><option key={z} value={z}>{z===browserZone?`${z} (device)`:z}</option>)}</select></label><button onClick={()=>void run(async()=>{await navigator.clipboard.writeText(location.href);setMessage('Poll link copied.')})}>Copy share link</button>{owner&&<button disabled={busy} onClick={()=>void run(async()=>{await request(`/${id}`,{method:'PATCH',body:JSON.stringify({closed:!poll.closed})},true);setPoll(await request(`/${id}`) as Poll);signalTasksChanged()})}>{poll.closed?'Reopen poll':'Close poll'}</button>}</div>
   <p>{poll.invited_count} {poll.invited_count===1?'person':'people'} invited · Link access is open · {poll.participants} responses · {poll.closed?'Closed to responses':'Open'} · Original timezone: {poll.timezone}</p>
   <p>Tap or drag to mark your availability. Click or drag across days to mark whole days, or across times to mark those times on every day. Darker green means more people are available. Outlined cells are your selections. Changes are saved only when you select “Save availability.”</p>
   {token&&<p>Your availability is saved to your account and reused across polls. Weeks with no saved entries use the median for the same weekday and time in earlier weeks; ties stay unavailable. {suggested.size>0?`${suggested.size} selected slots are historical suggestions. Review and save to confirm them.`:'Only saved entries are used for the group overlap.'}</p>}
   <div className="availability-grid-wrap" onPointerUp={()=>{painting.current=null}} onPointerCancel={()=>{painting.current=null}} onPointerLeave={()=>{painting.current=null}}><table className="availability-grid"><caption>Availability in {zone}; each cell is 30 minutes. Counts show saved responses. Blue columns are weekends.</caption><thead><tr><th scope="col">Time</th>{Object.entries(days).map(([day,slots])=><th scope="col" key={day} className={isWeekend(slots[0])?'availability-weekend':undefined}><button type="button" disabled={!token||poll.closed||busy} aria-label={`Toggle all times on ${day}`} aria-pressed={selectionState(slots)} {...slotControls(slots,'day')} title={day}><span className="availability-weekday" aria-hidden="true">{weekdayFormat.format(new Date(slots[0]))}</span><span className="availability-date" aria-hidden="true">{numericDateFormat.format(new Date(slots[0]))}</span></button></th>)}</tr></thead><tbody>{times.map(time=>{const rowSlots=poll.slots.filter(slot=>timeFormat.format(new Date(slot))===time);return <tr key={time}><th scope="row"><button type="button" disabled={!token||poll.closed||busy} aria-label={`Toggle ${time} across all days`} aria-pressed={selectionState(rowSlots)} {...slotControls(rowSlots,'time')}>{time}</button></th>{Object.entries(days).map(([day,slots])=>{const matches=slots.filter(s=>timeFormat.format(new Date(s))===time);return <td key={day} className={isWeekend(slots[0])?'availability-weekend':undefined}>{matches.map(slot=><button key={slot} type="button" disabled={!token||poll.closed||busy} className={suggested.has(slot)?'availability-suggested':undefined} aria-pressed={selected.has(slot)} aria-label={`${day} ${time}, ${poll.counts[slot]} of ${poll.participants} available${selected.has(slot)?', you selected this':''}${suggested.has(slot)?', suggested from history':''}`} style={{background:poll.counts[slot]?`rgba(22,132,125,${.16+.7*poll.counts[slot]/Math.max(1,poll.participants)})`:undefined}} {...slotControls([slot],'cell')}>{poll.counts[slot]}<span className="availability-selected">{selected.has(slot)?' ✓':''}</span></button>)}</td>})}</tr>})}</tbody></table></div>
   {token&&<div className="availability-actions"><button disabled={busy||poll.closed} onClick={()=>void run(async()=>{await request(`/${id}/me`,{method:'PUT',body:JSON.stringify({slots:[...selected]})},true);setPoll(await request(`/${id}`) as Poll);signalTasksChanged();setSuggested(new Set());setMessage('Availability saved to your account.')})}>Save availability</button><button disabled={busy||poll.closed} onClick={()=>{setSelected(new Set());setSuggested(new Set())}}>Clear selection</button><span>{selected.size} half-hour slots selected</span></div>}
   {owner&&token&&id&&<PollInvitations id={id} token={token} closed={poll.closed} onChange={async()=>setPoll(await request(`/${id}`) as Poll)}/>}
   <h2>Best overlap</h2>{best>0?<ul className="availability-best">{poll.slots.filter(s=>poll.counts[s]===best).slice(0,12).map(s=><li key={s}>{dateFormat.format(new Date(s))} · {timeFormat.format(new Date(s))} — {best}/{poll.participants} available</li>)}</ul>:<p>No availability saved yet.</p>}
  </>}
 </main>
}
