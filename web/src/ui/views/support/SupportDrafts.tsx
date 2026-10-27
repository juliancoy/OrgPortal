import {useEffect,useRef,useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {emailApi,type CampaignPreview,type CampaignSummary} from '../email/emailApi'
import {useAutosave} from '../../hooks/useAutosave'
import {AutosaveStatus} from '../../components/AutosaveStatus'

function plainHtml(text:string){return text.split('\n\n').map(p=>'<p>'+p.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<br>').replace(/(https:\/\/[^\s<>"]+)/g,'<a href="$1">$1</a>')+'</p>').join('')}
type Draft=CampaignPreview&{content_json?:string;native_sender?:boolean}
export function SupportDrafts({token,organizationId}:{token:string|null;organizationId:string}){
 const [params,setParams]=useSearchParams(),id=params.get('campaign_id')||''
 const [drafts,setDrafts]=useState<CampaignSummary[]>([]),[draft,setDraft]=useState<Draft|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true)
 useEffect(()=>{let cancelled=false;setLoading(true);setDraft(null);setError('');void emailApi<CampaignSummary[]>(token,'/campaigns?organization_id='+encodeURIComponent(organizationId)).then(rows=>{if(!cancelled)setDrafts(rows.filter(d=>d.status==='draft'))}).catch(e=>{if(!cancelled)setError(e.message)}).finally(()=>{if(!cancelled)setLoading(false)});return()=>{cancelled=true}},[token,organizationId])
 useEffect(()=>{let cancelled=false;setDraft(null);if(id)void emailApi<Draft>(token,'/campaigns/'+encodeURIComponent(id)).then(data=>{if(!cancelled){if(data.organization_id===organizationId&&data.status==='draft')setDraft(data);else setError('This draft is not available for the selected organization.')}}).catch(e=>{if(!cancelled)setError(e.message)});return()=>{cancelled=true}},[token,organizationId,id])
 return <div className="support-drafts"><header><h2>Drafts</h2><p>Saved organization emails. Open a draft to edit and review it before distribution.</p></header>{error&&<p role="alert">{error}</p>}
 <div className="support-draft-picker"><label>Saved draft<select aria-label="Saved draft" value={id} onChange={e=>{const next=new URLSearchParams(params);next.set('folder','drafts');next.set('organization_id',organizationId);next.set('campaign_id',e.target.value);setParams(next)}}><option value="">Choose a draft</option>{drafts.map(d=><option key={d.id} value={d.id}>{d.subject}</option>)}</select></label><span>{loading?'Loading…':`${drafts.length} saved draft${drafts.length===1?'':'s'}`}</span></div>
 {draft?<DraftEditor key={draft.id} token={token} initial={draft}/>:!loading&&<p>{drafts.length?'Choose a saved draft to see the email.':'No drafts for this organization yet.'}</p>}
 </div>
}
function DraftEditor({token,initial}:{token:string|null;initial:Draft}){
 const [campaign,setCampaign]=useState(initial),[subject,setSubject]=useState(initial.subject),[body,setBody]=useState(initial.body)
 const [html,setHtml]=useState(()=>{try{return JSON.parse(initial.content_json||'{}').body_html||plainHtml(initial.body)}catch{return plainHtml(initial.body)}})
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 const editor=useRef<HTMLDivElement>(null),current=useRef(initial);current.current=campaign
 const autosave=useAutosave({scope:`email-draft:${token}:${initial.id}`,value:{subject,body,html},enabled:initial.status==='draft',save:async value=>{
  await emailApi(token,'/campaigns/'+initial.id,'PATCH',{subject:value.subject,body:value.body,body_html:value.html,fingerprint:current.current.fingerprint})
  const fresh=await emailApi<Draft>(token,'/campaigns/'+initial.id);current.current=fresh;setCampaign(fresh);setMessage('')
 }})
 useEffect(()=>{if(editor.current)editor.current.innerHTML=html},[]) // initial sanitized server content; edits stay in the DOM
 const ready=autosave.status==='saved'&&!busy
 function command(name:string){editor.current?.focus();if(name==='createLink'){const url=window.prompt('Link URL (https://…)');if(!url)return;try{if(new URL(url).protocol!=='https:')throw Error();document.execCommand(name,false,url)}catch{setError('Use an HTTPS link.');return}}else document.execCommand(name,false);if(editor.current){setBody(editor.current.innerText);setHtml(editor.current.innerHTML)}}
 async function reviewCopy(){setBusy(true);setError('');setMessage('');try{
   if(!await autosave.flush())throw Error('Save the draft before sending a preview.')
   const fresh=await emailApi<Draft>(token,'/campaigns/'+initial.id);current.current=fresh;setCampaign(fresh)
   const result=await emailApi<{sent?:boolean;queued?:boolean}>(token,'/campaigns/'+initial.id+(fresh.native_sender?'/review-copy':'/test'),'POST',fresh.native_sender?{recipient:'julian@gmail.com',requestId:crypto.randomUUID(),fingerprint:fresh.fingerprint,preview_id:fresh.preview_id}:{recipient:'julian@gmail.com'})
   setMessage(result.sent?'Preview accepted for julian@gmail.com. The subscriber audience was not changed.':'Preview queued for julian@gmail.com. The subscriber audience was not changed.')
   const updated=await emailApi<Draft>(token,'/campaigns/'+initial.id);current.current=updated;setCampaign(updated)
  }catch(e){setError(e instanceof Error?e.message:'Unable to send preview')}finally{setBusy(false)}}
 return <section className="support-draft-editor" aria-label="Edit email draft"><p className="support-draft-meta"><strong>From:</strong> {campaign.from_email}<br/><strong>Audience:</strong> {campaign.recipient_count} subscribed recipient{campaign.recipient_count===1?'':'s'}</p>
 <label>Subject<input value={subject} disabled={busy} maxLength={200} onChange={e=>setSubject(e.target.value)}/></label>
 <label id="draft-message-label">Message</label><div className="support-rich-toolbar" role="toolbar" aria-label="Message formatting">{[['bold','Bold'],['italic','Italic'],['insertUnorderedList','Bullet list'],['createLink','Link']].map(([cmd,label])=><button key={cmd} type="button" disabled={busy} onMouseDown={e=>e.preventDefault()} onClick={()=>command(cmd)}>{label}</button>)}</div>
 <div ref={editor} className="support-rich-editor" contentEditable={!busy} suppressContentEditableWarning role="textbox" aria-multiline="true" aria-labelledby="draft-message-label" onInput={e=>{setBody(e.currentTarget.innerText);setHtml(e.currentTarget.innerHTML)}} onDrop={e=>{e.preventDefault();document.execCommand('insertText',false,e.dataTransfer.getData('text/plain'))}} onPaste={e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'))}}/>
 <AutosaveStatus state={autosave} onRetry={autosave.retry}/>
 <section className="support-draft-render" aria-label="Rendered email"><h3>Email preview</h3><p>The saved email, including its layout and event details.</p><iframe className="support-email-preview" title="Draft email preview" sandbox="" referrerPolicy="no-referrer" srcDoc={campaign.preview.html}/></section>
 <div className="support-draft-actions"><button type="button" disabled={!ready} onClick={()=>void reviewCopy()}>Send preview to julian@gmail.com</button></div>
 {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 {!campaign.native_sender&&!campaign.self_test_sent&&<p>Send the required test to your connected sender from Campaigns before requesting an additional review copy.</p>}
 <p>Preview copies go only to Julian. Distribution remains a separate action.</p>
 </section>
}
