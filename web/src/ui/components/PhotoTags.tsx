import { useEffect, useState } from 'react'
import { useAuth } from '../../app/AppProviders'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'

type Tag = {label:string;region?:{x:number;y:number;width:number;height:number}}
export function PhotoTags({source,ownerId,photoId}:{source:'event'|'organization'|'carousel';ownerId:string;photoId:string}) {
 const {token}=useAuth()
 const [tags,setTags]=useState<Tag[]>([]),[names,setNames]=useState(''),[canEdit,setCanEdit]=useState(false)
 const [preview,setPreview]=useState<{previewId:string;tags:Tag[]}|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const path=`/api/org/api/photo-tags/${source}/${encodeURIComponent(ownerId)}/${encodeURIComponent(photoId)}`
 async function request(body?:unknown){
  const send=(auth:string|null)=>fetch(path,{method:body?'POST':'GET',cache:'no-store',headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},body:body?JSON.stringify(body):undefined})
  let response=await send(token)
  if(response.status===401&&token){const refreshed=await refreshRuntimeTokenFromSession();if(refreshed)response=await send(refreshed)}
  if(!response.ok)throw new Error('Unable to load or save photo tags. Please try again.')
  return response.json()
 }
 useEffect(()=>{
  let active=true;setTags([]);setNames('');setPreview(null);setCanEdit(false);setMessage('')
  void request().then(data=>{if(active){setTags(data.tags);setNames(data.tags.map((t:Tag)=>t.label).join('\n'));setCanEdit(data.canEdit)}}).catch(()=>{if(active)setMessage('Photo tags are unavailable.')})
  return()=>{active=false}
 // Each photo/account has an independent draft and preview receipt.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[path,token])
 async function save(confirm:boolean){
  setBusy(true);setMessage('')
  try{
   const next=preview?.tags||names.split('\n').map(label=>label.trim()).filter(Boolean).map(label=>tags.find(t=>t.label===label)||{label})
   const result=await request({tags:next,confirm,...(confirm&&preview?{previewId:preview.previewId}:{})})
   if(confirm){setTags(result.tags);setPreview(null);setMessage('Photo tags saved.')}else setPreview({previewId:result.previewId,tags:next})
  }catch(error){setPreview(null);setMessage(error instanceof Error?error.message:'Unable to save photo tags.')}finally{setBusy(false)}
 }
 return <section className="photo-tags" aria-label="People in this photo" style={{padding:12,color:'var(--text-primary)',background:'var(--panel)',textAlign:'left'}}>
  <h3>People in this photo</h3>
  {tags.length?<ul>{tags.map((tag,index)=><li key={index}>{tag.label}</li>)}</ul>:<p>No people tagged yet.</p>}
  {canEdit&&<details><summary>Edit people tags</summary><p>Tags are public. Add people who agreed to be named.</p>
   <label>Names, one per line<textarea maxLength={3030} rows={3} value={names} disabled={busy} onChange={e=>{setNames(e.target.value);setPreview(null)}} style={{width:'100%',color:'inherit',background:'var(--panel)',font:'inherit'}}/></label>
   {preview?<><p>Publish {preview.tags.length?preview.tags.map(t=>t.label).join(', '):'no people tags'}?</p><button disabled={busy} onClick={()=>void save(true)}>Confirm photo tags</button><button disabled={busy} onClick={()=>setPreview(null)}>Cancel</button></>:<button disabled={busy} onClick={()=>void save(false)}>Review photo tags</button>}
  </details>}
  {message&&<p role="status">{message}</p>}
 </section>
}
