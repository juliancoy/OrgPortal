import { useEffect, useId, useState } from 'react'
import { FileText, Paperclip, Trash2 } from 'lucide-react'
import { useAuth } from '../../app/AppProviders'
import { attachmentBase, attachmentRequest, submissionAttachmentAccept, uploadSubmissionAttachment, type SubmissionAttachment, type StagedSubmissionAttachment } from './submissionAttachments'

const emptyAttachments:SubmissionAttachment[]=[]
function sizeLabel(bytes:number){return bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} KB`:`${(bytes/(1024*1024)).toFixed(1)} MB`}
export function SubmissionAttachmentPicker({files,onChange,disabled=false}:{files:StagedSubmissionAttachment[];onChange:(files:StagedSubmissionAttachment[])=>void;disabled?:boolean}){
 const id=useId(),[error,setError]=useState('')
 return <fieldset className="submission-attachments"><legend><Paperclip size={18} aria-hidden="true" /> Attachments</legend>
  <p className="muted">Optional images, PDFs, PowerPoint presentations, Word documents, spreadsheets, text files or ZIP archives. Up to 10 files, 20 MB each. Submitted files are publicly visible.</p>
  <label htmlFor={id}>Add submission attachments</label><input id={id} type="file" accept={submissionAttachmentAccept} multiple disabled={disabled} onChange={event=>{
   const incoming=Array.from(event.target.files||[]);event.target.value='';setError('')
   if(incoming.some(file=>!file.size||file.size>20*1024*1024)){setError('Choose nonempty files, 20 MB or smaller.');return}
   if(files.length+incoming.length>10){setError('Choose at most 10 files.');return}
   onChange([...files,...incoming.map(file=>({id:crypto.randomUUID(),file}))])
  }} />
  {!!files.length&&<><ul>{files.map(item=><li key={item.id}><span>{item.file.name} · {sizeLabel(item.file.size)}</span><button className="btn-secondary" type="button" disabled={disabled} aria-label={`Remove selected file ${item.file.name}`} onClick={()=>onChange(files.filter(file=>file.id!==item.id))}>Remove</button></li>)}</ul><p className="muted">Selected files stay in this open form. Reselect them if you reload before uploading.</p></>}
  {error&&<p role="alert">{error}</p>}
 </fieldset>
}
export function SubmissionAttachments({eventId,submissionId,initial=emptyAttachments,canManage=false}:{eventId:string;submissionId:string;initial?:SubmissionAttachment[];canManage?:boolean}){
 const {token}=useAuth(),[attachments,setAttachments]=useState(initial),[files,setFiles]=useState<StagedSubmissionAttachment[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{setAttachments(initial)},[initial])
 const base=attachmentBase(eventId,submissionId)
 async function refresh(){const data=await attachmentRequest(base,null);setAttachments(data.attachments)}
 return <section className="submission-attachments" aria-label="Submission attachments">
  <h4><Paperclip size={18} aria-hidden="true" /> Attachments</h4>
  {!attachments.length&&<p className="muted">No attachments yet.</p>}
  <ul>{attachments.map(file=><li key={file.id}>
   <a className="submission-attachment-link" href={`${base}/${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer">
    {file.contentType.startsWith('image/')?<img src={`${base}/${encodeURIComponent(file.id)}`} alt={file.name} loading="lazy" />:<FileText size={24} aria-hidden="true" />}
    <span>{file.name}<small>{file.contentType.startsWith('image/')?'Image':'Download'} · {sizeLabel(file.size)}</small></span>
   </a>
   {canManage&&token&&<button className="btn-secondary" type="button" disabled={busy} aria-label={`Delete attachment ${file.name}`} onClick={()=>{
    setBusy(true);setError('');void attachmentRequest(`${base}/${encodeURIComponent(file.id)}`,token,{method:'DELETE'}).then(refresh).catch(reason=>setError(reason.message)).finally(()=>setBusy(false))
   }}><Trash2 size={16} aria-hidden="true" /> Remove</button>}
  </li>)}</ul>
  {canManage&&token&&<><SubmissionAttachmentPicker files={files} onChange={setFiles} disabled={busy} />{!!files.length&&<button type="button" className="btn-primary" disabled={busy} onClick={()=>{
   setBusy(true);setError('');void(async()=>{for(const file of files){await uploadSubmissionAttachment(eventId,submissionId,file,token);setFiles(previous=>previous.filter(item=>item.id!==file.id))}await refresh()})().catch(reason=>{setError(reason.message);void refresh().catch(()=>{})}).finally(()=>setBusy(false))
  }}>{busy?'Uploading…':'Upload attachments'}</button>}</>}
  {error&&<p role="alert">{error}</p>}
 </section>
}
