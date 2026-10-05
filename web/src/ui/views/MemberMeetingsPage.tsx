import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'
import './availability.css'

type Meeting = { id:string;starts_at:string;ends_at:string;status:string }
const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone
export function MemberMeetingsPage() {
 const {token}=useAuth(),{host}=useParams()
 const [enabled,setEnabled]=useState(false),[meetings,setMeetings]=useState<Meeting[]>([]),[slots,setSlots]=useState<string[]>([])
 const [date,setDate]=useState(new Date().toLocaleDateString('en-CA'))
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 async function request(path:string,method='GET',body?:unknown) {
  const send=(auth:string|null)=>fetch(`/api/org/api/meetings${path}`,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},body:body===undefined?undefined:JSON.stringify(body)})
  let response=await send(token)
  if(response.status===401){const refreshed=await refreshRuntimeTokenFromSession();if(refreshed)response=await send(refreshed)}
  if(!response.ok)throw new Error((await response.text())||'Unable to update meetings.')
  return response.json()
 }
 async function load() {
  if(host) {
   const start=new Date(`${date}T00:00:00`),end=new Date(start);end.setDate(end.getDate()+7)
   const data=await request(`/${encodeURIComponent(host)}/slots?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`)
   setSlots(data.slots);setMessage(data.message||'')
  }else{
   const [settings,data]=await Promise.all([request('/preferences'),request('')]);setEnabled(settings.enabled);setMeetings(data.meetings)
  }
 }
 useEffect(()=>{setSlots([]);setError('');if(token)void load().catch(e=>setError(e.message))},[token,host,date])
 async function run(action:()=>Promise<void>) {setBusy(true);setError('');try{await action()}catch(e){setError(e instanceof Error?e.message:'Unable to save.')}finally{setBusy(false)}}
 const format=new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:timezone})
 return <main className="availability-page">
  <h1>{host?'Schedule a member meeting':'My meetings'}</h1>
  <p>Meetings last 30 minutes. Available times exclude existing bookings, registered events, provider appointments, and the LifeTech organizers meetup. Times shown in {timezone}.</p>
  <p><Link to="/people">Find a person</Link> · <Link to="/meetings">My meetings</Link> · <Link to="/onboarding#availability">Edit my typical week</Link> · <Link to="/calendar/integrations">Calendar feeds</Link></p>
  {!token&&<p><Link to={`/users/login?next=${encodeURIComponent(host?`/meetings/${host}`:'/meetings')}`}>Sign in</Link> to schedule meetings.</p>}
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {token&&(host?<>
   <label>Week starting<input type="date" value={date} disabled={busy} onChange={e=>{if(e.target.value)setDate(e.target.value)}}/></label>
   <ul>{slots.map(slot=><li key={slot}><button disabled={busy} onClick={()=>void run(async()=>{await request(`/${encodeURIComponent(host)}/book`,'POST',{starts_at:slot});await load();setMessage('Meeting booked. It is included in your personal calendar feed.')})}>{format.format(new Date(slot))}</button></li>)}</ul>
  </>:<>
   <label><input type="checkbox" checked={enabled} disabled={busy} onChange={e=>{const value=e.target.checked;void run(async()=>{await request('/preferences','PUT',{enabled:value,timezone});setEnabled(value);setMessage(value?'Members can now book your available times.':'New meeting bookings disabled.')})}}/>Allow organization members to book my available times</label>
   <p>Your saved typical week and subsequent availability updates supply booking times. You can disable new bookings at any time.</p>
   <ul>{meetings.map(meeting=><li key={meeting.id}>{format.format(new Date(meeting.starts_at))} · {meeting.status} {meeting.status==='confirmed'&&<button disabled={busy} onClick={()=>void run(async()=>{await request(`/${meeting.id}/cancel`,'POST');await load();setMessage('Meeting cancelled.')})}>Cancel meeting</button>}</li>)}</ul>
  </>)}
 </main>
}
