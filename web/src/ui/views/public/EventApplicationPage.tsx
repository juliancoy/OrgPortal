import {useEffect, useRef, useState} from 'react'
import {Link, useLocation, useNavigate, useParams} from 'react-router-dom'
import {ArrowLeft, Copy} from 'lucide-react'
import {useAuth} from '../../../app/AppProviders'
import {EventPresentations, type PresentationApplication, type PresentationFormAction} from '../../components/EventPresentations'
import {getActivePortalProfileConfig} from '../../../config/portalFeatures'
import {applicationBrandStyle} from '../../../config/applicationBranding'
import './event-application.css'

type ApplicationEvent = {id:string; title:string}
export function ApplicationPageHeader({eventTitle,editing=false,submitted=false}:{eventTitle:string;editing?:boolean;submitted?:boolean}) {
 const profile=getActivePortalProfileConfig()
 const logo=profile.brandImagePath?.replace('https://lifetech.fyi/','/')
 return <header className="application-event-context">
  <div className="application-identity">{logo&&<img src={logo} alt="" width={32} height={40}/>}<span>{profile.brandName}</span></div>
  <p className="application-event-name">{eventTitle}</p>
  <h1>{submitted?(editing?'Application updated':'Application received'):editing?'Edit your application':'Presenter application'}</h1>
  {!submitted&&!editing&&<p className="application-introduction">Submit your research, project or demonstration for consideration.</p>}
 </header>
}
export function ApplicationConfirmation({eventPath,submissionId,editing,onView}:{eventPath:string;submissionId:string;editing:boolean;onView?:()=>void}) {
 const heading=useRef<HTMLHeadingElement>(null)
 useEffect(()=>{heading.current?.focus()},[])
 return <section className="application-confirmation" aria-labelledby="application-confirmation-title">
  <h2 ref={heading} tabIndex={-1} id="application-confirmation-title">{editing?'Changes saved':'Submission complete'}</h2>
  <p>Your presentation has been saved for the event organizers. You can return to your application to review or update it.</p>
  <div className="application-page-actions"><Link className="btn-primary" onClick={onView} to={`${eventPath}/apply?edit=${encodeURIComponent(submissionId)}`}>View application</Link><Link className="btn-secondary" to={eventPath}>Back to event</Link></div>
 </section>
}
export function EventApplicationPage() {
 const navigate=useNavigate()
 const {slug}=useParams(),location=useLocation(),{token,isLoading}=useAuth()
 const edit=new URLSearchParams(location.search).get('edit')
 const eventPath=`/events/${encodeURIComponent(slug||'')}`
 const [event,setEvent]=useState<ApplicationEvent|null>(null),[action,setAction]=useState<PresentationFormAction|null>(null)
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [saved,setSaved]=useState(''),[copyStatus,setCopyStatus]=useState('')
 useEffect(()=>{
  if(isLoading)return
  const controller=new AbortController()
  setReady(false);setError('');setEvent(null);setAction(null);setSaved('')
  async function load(){
   const response=await fetch(`/api/org/api/network/events/public/${encodeURIComponent(slug||'')}`,{signal:controller.signal})
   if(!response.ok)throw new Error('This event could not be loaded.')
   const data:ApplicationEvent=await response.json()
   let application:PresentationApplication|undefined
   if(edit&&token){
    const own=await fetch(`/api/org/api/network/events/${encodeURIComponent(data.id)}/presentations`,{signal:controller.signal,headers:{Authorization:`Bearer ${token}`},cache:'no-store'})
    if(!own.ok)throw new Error('Your application could not be loaded.')
    const result=await own.json()
    application=(result.submissions||[]).find((row:PresentationApplication)=>row.submission_id===edit)
    if(!application)throw new Error('This application is unavailable or you do not have access to it.')
   }
   if(controller.signal.aborted)return
   setEvent(data);setAction(application?{kind:'edit',application}:null);setReady(true)
  }
  void load().catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Unable to load application.')})
  return()=>controller.abort()
 },[slug,edit,token,isLoading,revision])
 const mcpPath=['orgportal.cc','localhost','127.0.0.1'].includes(window.location.hostname)?'/mcp':'/api/org/mcp'
 const prompt=`Connect to ${window.location.origin}${mcpPath} with my account using OAuth. Help me submit a presentation for ${window.location.origin}${eventPath}/apply. Ask for my organization, presentation title and summary, and use the organization's shared team list. Show me a preview and ask for my approval before submitting.`
 return <div className="event-application-page" style={applicationBrandStyle()}>
  <Link className="application-back" to={eventPath}><ArrowLeft size={18} aria-hidden="true" /> Back to event</Link>
  {event&&<ApplicationPageHeader eventTitle={event.title} editing={!!edit} submitted={!!saved}/>}
  {error?<section className="application-message"><p role="alert">{error}</p><button className="btn-secondary" onClick={()=>setRevision(value=>value+1)}>Try again</button></section>:!ready?<p role="status">Loading application…</p>:saved?<ApplicationConfirmation eventPath={eventPath} submissionId={saved} editing={!!edit} onView={()=>setRevision(value=>value+1)}/>:<>
   <EventPresentations key={`${event!.id}:${edit||'new'}`} eventId={event!.id} formAction={action} onActionHandled={()=>setAction(null)} onSubmitted={setSaved} onCancelEdit={()=>navigate(`${eventPath}#submissions`)}/>
   {!edit&&<details className="presentation-ai-option"><summary>Apply with an AI assistant</summary><p>Copy this prompt into an assistant that supports MCP, then approve the connection with your account.</p><textarea aria-label="Submission prompt" readOnly value={prompt} rows={5} onFocus={e=>e.currentTarget.select()}/><button className="btn-secondary" onClick={()=>{void navigator.clipboard.writeText(prompt).then(()=>setCopyStatus('Prompt copied'),()=>setCopyStatus('Select and copy the prompt above.'))}}><Copy size={16} aria-hidden="true"/> Copy prompt</button><span role="status">{copyStatus}</span></details>}
  </>}
 </div>
}
