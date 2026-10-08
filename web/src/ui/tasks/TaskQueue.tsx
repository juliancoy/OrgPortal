import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'
import './tasks.css'
type Task = { id: string; title: string; kind: 'personal' | 'availability'; href: string | null }
export function signalTasksChanged() { window.dispatchEvent(new Event('portal:tasks-changed')) }
export function useTaskQueue() {
 const {token,user}=useAuth()
 const [tasks,setTasks]=useState<Task[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const generation=useRef(0),refreshSequence=useRef(0)
 const request=useCallback(async(path='',init:RequestInit={})=>{
  const send=(auth:string|null)=>fetch(`/api/org/api/tasks${path}`,{...init,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})}})
  let response=await send(token)
  if(response.status===401){const refreshed=await refreshRuntimeTokenFromSession();if(refreshed)response=await send(refreshed)}
  if(!response.ok)throw new Error('Tasks could not be updated. Please try again.')
  const data=await response.json()
  if(path===''&&(!init.method||init.method==='GET')&&(!data||!Array.isArray(data.tasks)))throw new Error('Tasks unavailable. Please try again.')
  return data
 },[token])
 const refresh=useCallback(async()=>{
  if(!token)return
  const current=generation.current,sequence=++refreshSequence.current
  try{const data=await request();if(current===generation.current&&sequence===refreshSequence.current){setTasks(data.tasks);setError('')}}catch(e){if(current===generation.current&&sequence===refreshSequence.current)setError(e instanceof Error?e.message:'Tasks unavailable.')}
 },[request,token])
 useEffect(()=>{
  generation.current++;setTasks([]);setError('');setBusy(false)
  if(!token)return
  void refresh()
  const wake=()=>{if(document.visibilityState==='visible')void refresh()}
  const interval=window.setInterval(wake,30000)
  window.addEventListener('focus',wake);window.addEventListener('portal:tasks-changed',wake)
  return()=>{generation.current++;window.clearInterval(interval);window.removeEventListener('focus',wake);window.removeEventListener('portal:tasks-changed',wake)}
 },[token,user?.id,refresh])
 async function mutate(path:string,body?:unknown){
  const current=generation.current;setBusy(true);setError('')
  try{await request(path,{method:'POST',body:body===undefined?undefined:JSON.stringify(body)});if(current===generation.current){await refresh();signalTasksChanged();return true}}
  catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Tasks unavailable.')}
  finally{if(current===generation.current)setBusy(false)}
  return false
 }
 return {tasks,error,busy,refresh,add:(title:string)=>mutate('',{title}),complete:(id:string)=>mutate(`/${encodeURIComponent(id)}/complete`)}
}
export function TaskQueue({queue,onNavigate}: {queue:ReturnType<typeof useTaskQueue>;onNavigate?:()=>void}) {
 const [title,setTitle]=useState('')
 return <section className="user-task-queue" aria-label="Your task queue">
  <h3>Your tasks <span>({queue.tasks.length})</span></h3>
  <p>Tasks stay here until complete. Saving your availability completes a poll task.</p>
  {queue.tasks.length?<ol>{queue.tasks.map(task=><li key={task.id}>{task.href?<Link to={task.href} onClick={onNavigate}>{task.title}</Link>:<><span>{task.title}</span><button type="button" disabled={queue.busy} onClick={()=>void queue.complete(task.id)} aria-label={`Complete ${task.title}`}>Complete</button></>}</li>)}</ol>:<p>No unfinished tasks.</p>}
  <form onSubmit={event=>{event.preventDefault();void queue.add(title).then(ok=>{if(ok)setTitle('')})}}>
   <label>Add a personal task<input required maxLength={160} value={title} onChange={event=>setTitle(event.target.value)} placeholder="What do you need to do?" /></label>
   <button disabled={queue.busy||!title.trim()}>Add task</button>
  </form>
  {queue.error&&<p role="alert">{queue.error}</p>}
 </section>
}
