export type SubmissionAttachment={id:string;name:string;contentType:string;size:number}
export type StagedSubmissionAttachment={id:string;file:File}
export const submissionAttachmentAccept='.png,.jpg,.jpeg,.gif,.webp,.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.txt,.csv,.md,.zip'
export const attachmentBase=(event:string,submission:string)=>`/api/org/api/network/events/${encodeURIComponent(event)}/presentations/${encodeURIComponent(submission)}/attachments`
export async function attachmentRequest(url:string,token:string|null,options:RequestInit={}){
 const response=await fetch(url,{...options,cache:'no-store',headers:token?{Authorization:`Bearer ${token}`}:{}})
 const text=await response.text();let data
 try{data=JSON.parse(text)}catch{throw new Error(text||'Could not complete the attachment request.')}
 if(!response.ok)throw new Error(data.message||data.detail||data.error||'Could not complete the attachment request.')
 return data
}
export async function uploadSubmissionAttachment(event:string,submission:string,item:StagedSubmissionAttachment,token:string){
 const body=new FormData();body.set('id',item.id);body.set('file',item.file)
 return attachmentRequest(attachmentBase(event,submission),token,{method:'POST',body}) as Promise<SubmissionAttachment>
}
