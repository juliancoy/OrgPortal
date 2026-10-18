import {useState} from 'react'
import {emailApi} from './emailApi'
export function EmailHistoryImport({token,groupId,onCreated}:{token:string|null;groupId:string;onCreated:(id:string)=>Promise<void>}){
 const [payload,setPayload]=useState<Record<string,unknown>|null>(null),[preview,setPreview]=useState<{previewId?:string;id?:string;recipients?:number;accepted?:number;known_bounced?:number}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 return <details><summary>Import a completed campaign report</summary><p>Import a private JSON report with source evidence, Gmail receipt IDs and known failure notices. This creates analytics only and cannot send messages. Unmeasured opens and clicks remain unavailable.</p>
 <input aria-label="Completed campaign JSON" type="file" accept=".json,application/json" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>1000000){setError('Choose a report under 1 MB.');return}setBusy(true);void f.text().then(async text=>{const value=JSON.parse(text);const data={...value,organizationId:groupId,confirm:false};setPayload(data);setPreview(await emailApi(token,'/outreach/history','POST',data));setError('')}).catch(err=>setError(err.message)).finally(()=>setBusy(false))}}/>
 {preview&&<><p>{preview.recipients} recipients · {preview.accepted} accepted · {preview.known_bounced} known bounces</p><button disabled={busy} onClick={()=>{setBusy(true);void emailApi<{id:string}>(token,'/outreach/history','POST',{...payload,organizationId:groupId,previewId:preview.previewId,confirm:true}).then(r=>onCreated(r.id)).catch(e=>setError(e.message)).finally(()=>setBusy(false))}}>Import report without sending</button></>}{error&&<p role="alert">{error}</p>}
 </details>
}
