import { useCallback, useEffect, useState } from 'react'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'
import { signalTasksChanged } from './TaskQueue'
type Person={user_id:string;user_name:string}
type Invite=Person&{responded:number}
export function PollInvitations({id,token,closed,onChange}:{id:string;token:string;closed:boolean;onChange:()=>Promise<void>}){
 const [query,setQuery]=useState(''),[people,setPeople]=useState<Person[]>([]),[chosen,setChosen]=useState<Record<string,Person>>({}),[invites,setInvites]=useState<Invite[]>([])
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 const request=useCallback(async(path:string,init:RequestInit={},signal?:AbortSignal)=>{
  const send=(auth:string)=>fetch(`/api/org/api${path}`,{...init,signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth}`}})
  let response=await send(token);if(response.status===401){const next=await refreshRuntimeTokenFromSession();if(next)response=await send(next)}
  if(!response.ok)throw new Error('Invitations could not be updated. Please try again.')
  return response.json()
 },[token])
 useEffect(()=>{
  const controller=new AbortController()
  request(`/availability/${id}/invites`,{},controller.signal).then(data=>setInvites(data.invites)).catch(e=>{if(!controller.signal.aborted)setError(e.message)})
  return()=>controller.abort()
 },[id,request])
 useEffect(()=>{
  const controller=new AbortController()
  const timer=window.setTimeout(()=>{request(`/network/users?limit=40&q=${encodeURIComponent(query.trim())}`,{},controller.signal).then(setPeople).catch(e=>{if(!controller.signal.aborted)setError(e.message)})},250)
  return()=>{window.clearTimeout(timer);controller.abort()}
 },[query,request])
 async function assign(){
  setBusy(true);setError('');setMessage('')
  try{await request(`/availability/${id}/invites`,{method:'POST',body:JSON.stringify({user_ids:Object.keys(chosen)})});setChosen({});setInvites((await request(`/availability/${id}/invites`)).invites);await onChange();signalTasksChanged();setMessage('Invitations assigned. Each person has a task to save their availability.')}
  catch(e){setError(e instanceof Error?e.message:'Unable to invite people.')}
  finally{setBusy(false)}
 }
 return <section className="availability-invitations" aria-label="Poll invitations">
  <h2>Invite people and assign this poll</h2>
  <p>Invited people receive a task in notifications until they save a response. The poll link also works for other signed-in people.</p>
  <label>Find portal members<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search by name" /></label>
  <div className="availability-invite-people">{people.map(person=>{const invited=invites.some(invite=>invite.user_id===person.user_id);return <label key={person.user_id}><input type="checkbox" checked={!!chosen[person.user_id]} disabled={closed||busy||invited||(!chosen[person.user_id]&&Object.keys(chosen).length>=50)} onChange={event=>setChosen(previous=>{const next={...previous};if(event.target.checked)next[person.user_id]=person;else delete next[person.user_id];return next})}/>{person.user_name||'Portal member'}{invited?' · Invited':''}</label>})}{!people.length&&<p>No matching portal members.</p>}</div>
  {Object.keys(chosen).length>0&&<p>Selected: {Object.values(chosen).map(person=>person.user_name).join(', ')}</p>}
  <button type="button" disabled={closed||busy||!Object.keys(chosen).length} onClick={()=>void assign()}>Assign to {Object.keys(chosen).length} {Object.keys(chosen).length===1?'person':'people'}</button>
  {invites.length>0&&<details><summary>{invites.length} invited</summary><ul>{invites.map(invite=><li key={invite.user_id}>{invite.user_name} · {invite.responded?'Responded':'Awaiting response'}</li>)}</ul></details>}
  {closed&&<p>Reopen the poll to invite people.</p>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 </section>
}
