import {PendingUploadGuard} from './PendingUploadGuard'
import {useEffect,useRef,useState,type FormEvent} from 'react'
import {Link,useLocation,useNavigate} from 'react-router-dom'

type Fields={contact_name:string;email:string;organization_name:string;teammate_email:string;title:string;summary:string}
const empty:Fields={contact_name:'',email:'',organization_name:'',teammate_email:'',title:'',summary:''}
export function GuestPresentationForm({eventId,eventTitle,eventPath}:{eventId:string;eventTitle:string;eventPath:string}){
 const completed=useRef(false)
 const navigate=useNavigate(),location=useLocation(),receipt=new URLSearchParams(location.search).get('submission')
 const [fields,setFields]=useState<Fields>(empty),[errors,setErrors]=useState<Record<string,string>>({}),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 const [status,setStatus]=useState<{submissionId:string;acknowledgementStatus:string}|null>(null),[ready,setReady]=useState(false),[closed,setClosed]=useState(false),[revision,setRevision]=useState(0)
 const alert=useRef<HTMLParagraphElement>(null),heading=useRef<HTMLHeadingElement>(null)
 const base=`/api/org/api/network/events/${encodeURIComponent(eventId)}/presentations`
 useEffect(()=>{const controller=new AbortController();setReady(false);setMessage('')
  void fetch(receipt?`${base}/apply/received?submission=${encodeURIComponent(receipt)}`:`${base}/public`,{headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal})
   .then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.message||'Unable to load the application.');return data})
   .then(data=>{if(controller.signal.aborted)return;if(receipt)setStatus({submissionId:receipt,acknowledgementStatus:data.acknowledgementStatus});else setClosed(!data.enabled||data.closed);setReady(true)})
   .catch(error=>{if(!controller.signal.aborted)setMessage(error.message)})
  return()=>controller.abort()
 },[base,receipt,revision])
 useEffect(()=>{if(message)alert.current?.focus()},[message])
 useEffect(()=>{if(status)heading.current?.focus()},[status])
 async function submit(event:FormEvent){
  event.preventDefault();if(busy)return;setErrors({});setMessage('')
  if(fields.email.trim().toLowerCase()===fields.teammate_email.trim().toLowerCase()){setErrors({teammate_email:'Use a teammate’s email address, different from your own.'});setMessage('Please check the teammate’s email address.');return}
  setBusy(true)
  try{
   const response=await fetch(`${base}/apply`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({...fields,website:''})})
   const data=await response.json().catch(()=>({message:'Unable to confirm the response. Your entries are still here; check your receipt email before trying again.'}))
   if(!response.ok){setErrors(data.errors||{});throw Error(data.message||'Your application could not be saved. Your entries are still here.')}
   if(!data.submissionId)throw Error(data.message||'Unable to confirm submission. Your entries are still here; check your receipt email before trying again.');completed.current=true;setStatus(data);navigate(`${eventPath}/apply/guest?submission=${encodeURIComponent(data.submissionId)}`,{replace:true})
  }catch(error){setMessage(error instanceof TypeError?'Connection lost. Your entries are still here. Check your receipt email before submitting again.':error instanceof Error?error.message:'Your entries are still here. Please try again.')}
  finally{setBusy(false)}
 }
 function field(key:keyof Fields,label:string,type='text',maxLength=255){return <label>{label}<input aria-label={label} name={key} type={type} required maxLength={maxLength} value={fields[key]} aria-invalid={!!errors[key]} aria-describedby={errors[key]?`guest-${key}-error`:undefined} onChange={event=>setFields(previous=>({...previous,[key]:event.target.value}))}/>{errors[key]&&<small id={`guest-${key}-error`} className="application-field-error">{errors[key]}</small>}</label>}
 return <section className="presentation-applications" aria-label="Guest presentation application">
  <PendingUploadGuard pending={!status&&(busy||Object.values(fields).some(Boolean))} textOnly allowLeave={()=>completed.current}/>
  {message&&<p role="alert" ref={alert} tabIndex={-1} className="application-message">{message}</p>}
  {status?<section className="application-confirmation"><h2 ref={heading} tabIndex={-1}>Application submitted</h2><p>Your application is saved. No account or further action is required.</p><dl className="application-receipt-summary"><dt>Event</dt><dd>{eventTitle}</dd>{fields.title&&<><dt>Presentation</dt><dd>{fields.title}</dd><dt>Team</dt><dd>{fields.organization_name}</dd></>}</dl><p>Your proposal is private to you and the event organizers.</p>{status.acknowledgementStatus==='accepted'?<p>A receipt email has been accepted for sending.</p>:<p>We could not confirm the receipt email was sent. Your application is still saved; please do not submit it again.</p>}<div className="application-page-actions"><Link className="btn-secondary" to={eventPath}>Back to event</Link></div><details className="presentation-ai-option"><summary>Link to an account (optional)</summary><p>To manage this application from an account, sign in with the same verified email address. Linking creates a team organization and sends an invitation to the teammate you supplied. Your proposal stays private to organizers.</p><Link to={`/presentation-claims/${encodeURIComponent(eventId)}/${encodeURIComponent(status.submissionId)}`}>Link application to my account</Link></details></section>:!ready?<div>{message?<button type="button" className="btn-secondary" onClick={()=>setRevision(value=>value+1)}>Try again</button>:<p role="status">Loading application…</p>}</div>:closed?<p role="status">Applications are closed for this event.</p>:<form className="presentation-form" aria-label="Guest presentation application" aria-busy={busy} onSubmit={submit}>
   <p>No account is needed. Your proposal and contact details go privately to the event organizers, rather than into public community voting.</p><p>Need to attach pictures or documents? <Link to={`${eventPath}/apply`}>Use the signed-in team application</Link>.</p>
   <fieldset className="presentation-fields" disabled={busy}><legend className="sr-only">Guest application details</legend><fieldset className="presentation-section"><legend>About you and your team</legend>{field('contact_name','Your name','text',200)}{field('email','Email','email',254)}<p className="muted">We’ll send a receipt to this address. Linking an account later is optional.</p>{field('organization_name','Team or organization')}{field('teammate_email','Teammate’s email','email',254)}<p className="muted">Your teammate will not be invited now. An invitation is sent only if you later choose to link this application to an account and confirm team creation.</p></fieldset><fieldset className="presentation-section"><legend>Presentation</legend>{field('title','Presentation title','text',200)}<label>What will you present?<textarea aria-label="What will you present?" name="summary" required maxLength={5000} rows={6} value={fields.summary} aria-invalid={!!errors.summary} aria-describedby={errors.summary?'guest-summary-error':undefined} onChange={event=>setFields(previous=>({...previous,summary:event.target.value}))}/>{errors.summary&&<small id="guest-summary-error" className="application-field-error">{errors.summary}</small>}</label></fieldset></fieldset>
   <div className="presentation-form-footer"><p className="muted">Applications are deleted 90 days after the event. Contact julian@codecollective.us to withdraw or request deletion.</p><button type="submit" className="btn-primary presentation-submit" disabled={busy}>{busy?'Submitting…':'Submit application'}</button></div>
  </form>}
 </section>
}
