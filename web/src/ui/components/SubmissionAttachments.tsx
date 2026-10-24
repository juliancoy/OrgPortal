import { useEffect, useId, useRef, useState } from 'react'
import { FileText, Paperclip, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../app/AppProviders'
import { attachmentBase, attachmentRequest, submissionAttachmentAccept, uploadSubmissionAttachment, type SubmissionAttachment, type StagedSubmissionAttachment } from './submissionAttachments'

const emptyAttachments:SubmissionAttachment[]=[]
function sizeLabel(bytes:number){return bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} KB`:`${(bytes/(1024*1024)).toFixed(1)} MB`}
export function SubmissionAttachmentPicker({files,onChange,disabled=false,buttonLabel}:{files:StagedSubmissionAttachment[];onChange:(files:StagedSubmissionAttachment[])=>void;disabled?:boolean;buttonLabel?:string}){
 const id=useId(),input=useRef<HTMLInputElement>(null),[error,setError]=useState('')
 return <div className="submission-attachment-picker" role="group" aria-label="Submission attachment picker">
  <span id={`${id}-help`} className="sr-only">Images, PDFs, presentations, documents, spreadsheets, text or ZIP files. Up to 10 files, 20 MB each. Uploaded attachments are public.</span>
  <button type="button" className="btn-secondary submission-attachment-add" aria-label="Add attachments" aria-describedby={`${id}-help`} title="Add attachments · up to 10 files, 20 MB each · publicly visible" disabled={disabled} onClick={()=>input.current?.click()}><Paperclip size={20} aria-hidden="true" />{buttonLabel?<span>{buttonLabel}</span>:<Plus size={14} aria-hidden="true" />}</button>
  <input ref={input} id={id} aria-label="Add submission attachments" hidden type="file" accept={submissionAttachmentAccept} multiple disabled={disabled} onChange={event=>{
   const incoming=Array.from(event.target.files||[]);event.target.value='';setError('')
   if(incoming.some(file=>!file.size||file.size>20*1024*1024)){setError('Choose nonempty files, 20 MB or smaller.');return}
   if(files.length+incoming.length>10){setError('Choose at most 10 files.');return}
   onChange([...files,...incoming.map(file=>({id:crypto.randomUUID(),file}))])
  }} />
  {!!files.length&&<><ul>{files.map(item=><li key={item.id}><span>{item.file.name} · {sizeLabel(item.file.size)}</span><button className="btn-secondary" type="button" disabled={disabled} aria-label={`Remove selected file ${item.file.name}`} onClick={()=>onChange(files.filter(file=>file.id!==item.id))}>Remove</button></li>)}</ul><p className="muted">Attachments will be public. Selected files stay in this open form; reselect them after reloading.</p></>}
  {error&&<p role="alert">{error}</p>}
 </div>
}
export function SubmissionAttachments({eventId,submissionId,initial=emptyAttachments,canManage=false}:{eventId:string;submissionId:string;initial?:SubmissionAttachment[];canManage?:boolean}){
 const {token}=useAuth(),[attachments,setAttachments]=useState(initial),[files,setFiles]=useState<StagedSubmissionAttachment[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{setAttachments(initial)},[initial])
 const base=attachmentBase(eventId,submissionId)
 async function refresh(){const data=await attachmentRequest(base,null);setAttachments(data.attachments)}
 if(!attachments.length&&!(canManage&&token))return null
 return <section className="submission-attachments" aria-label="Submission attachments">
  {!!attachments.length&&<ul>{attachments.map(file=><li key={file.id}>
   <a className="submission-attachment-link" href={`${base}/${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer">
    {file.contentType.startsWith('image/')?<img src={`${base}/${encodeURIComponent(file.id)}`} alt={file.name} loading="lazy" />:<FileText size={24} aria-hidden="true" />}
    <span>{file.name}<small>{file.contentType.startsWith('image/')?'Image':'Download'} · {sizeLabel(file.size)}</small></span>
   </a>
   {canManage&&token&&<button className="btn-secondary" type="button" disabled={busy} aria-label={`Delete attachment ${file.name}`} onClick={()=>{
    setBusy(true);setError('');void attachmentRequest(`${base}/${encodeURIComponent(file.id)}`,token,{method:'DELETE'}).then(refresh).catch(reason=>setError(reason.message)).finally(()=>setBusy(false))
   }}><Trash2 size={16} aria-hidden="true" /> Remove</button>}
  </li>)}</ul>}
  {canManage&&token&&<><SubmissionAttachmentPicker files={files} onChange={setFiles} disabled={busy} />{!!files.length&&<button type="button" className="btn-primary" disabled={busy} onClick={()=>{
   setBusy(true);setError('');void(async()=>{for(const file of files){await uploadSubmissionAttachment(eventId,submissionId,file,token);setFiles(previous=>previous.filter(item=>item.id!==file.id))}await refresh()})().catch(reason=>{setError(reason.message);void refresh().catch(()=>{})}).finally(()=>setBusy(false))
  }}>{busy?'Uploading…':'Upload attachments'}</button>}</>}
  {error&&<p role="alert">{error}</p>}
 </section>
}
