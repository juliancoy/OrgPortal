import {useEffect,useRef,useState,type FormEvent} from 'react'
import {Link} from 'react-router-dom'
import {useAuth} from '../../app/AppProviders'
import {newInitiative,initiativeStatuses,initiativeSummary,initiativeProgress,nextDeadline,type Initiative} from '../../../../shared/interventions'
import {useEcosystemQuery,type QueryPage} from '../../features/ecosystem/ecosystemApi'
import {useNetworkViewport} from '../../features/ecosystem/useNetworkViewport'
import '../../features/ecosystem/network.css'
import './intervention-dashboard.css'
type Org={id:string;name:string}
type Preview={previewId:string;expiresAt:string;operation:'save'|'delete';initiative:Initiative}
const endpoint='/api/org/api/network/initiatives'
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const date=(s:string)=>s?new Date(s+'T12:00:00').toLocaleDateString():'Not set'
function payload(i:Initiative){const {updatedAt,organizationName,...value}=i;void updatedAt;void organizationName;return value}
export function InterventionDashboardPage(){
 const root=useRef<HTMLDivElement>(null);useNetworkViewport(root);const {token}=useAuth()
 const [accessError,setAccessError]=useState('')
 const [records,setRecords]=useState<Initiative[]|null>(null),[managed,setManaged]=useState<Org[]>([]),[directoryQuery,setDirectoryQuery]=useState(''),[draft,setDraft]=useState<Initiative|null>(null),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[writeError,setWriteError]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[message,setMessage]=useState('')
 const [offset,setOffset]=useState(0),[nextOffset,setNextOffset]=useState<number|null>(null),[total,setTotal]=useState(0),[summary,setSummary]=useState<ReturnType<typeof initiativeSummary>|null>(null)
 const {data:directoryPage}=useEcosystemQuery<QueryPage<Org>>('organizations',{q:directoryQuery,limit:50})
 const directory=directoryPage?.records||[]
 async function load(signal?:AbortSignal){
  const params=new URLSearchParams({offset:String(offset),q:query,status:filter})
  const response=await fetch(endpoint+'/public?'+params,{signal,credentials:'omit',cache:'no-store'})
  if(!response.ok)throw Error('Shared planning is unavailable. Existing initiatives could not be loaded.')
  const page=await response.json();if(signal?.aborted)return
  setRecords(page.records);setNextOffset(page.nextOffset);setTotal(page.total);setSummary(page.summary);setError('')
 }
 useEffect(()=>{document.title='Maryland intervention dashboard';const abort=new AbortController();setRecords(null);const timer=setTimeout(()=>{void load(abort.signal).catch(e=>{if(!abort.signal.aborted)setError(e.message)})},150);return()=>{clearTimeout(timer);abort.abort()}},[offset,query,filter])
 useEffect(()=>{setManaged([]);setPreview(null);setAccessError('');if(!token)return;const abort=new AbortController();void fetch(endpoint+'/access',{signal:abort.signal,headers:{Authorization:`Bearer ${token}`}}).then(r=>r.ok?r.json():Promise.reject()).then(d=>{if(Array.isArray(d.organizations))setManaged(d.organizations)}).catch(()=>{if(!abort.signal.aborted)setAccessError('Management access could not be checked; publishing is disabled.')});return()=>abort.abort()},[token])
 const visible=records||[]
 const update=(key:keyof Initiative,value:string|number|null)=>{if(draft)setDraft({...draft,[key]:value});setPreview(null);setWriteError('')}
 async function review(event:FormEvent|undefined,operation:'save'|'delete'='save'){
  event?.preventDefault();if(!draft||!token)return;setBusy(true);setWriteError('')
  try{const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({operation,initiative:payload(draft)})});const body=await response.json();if(!response.ok)throw Error(body.detail||body.error||body.message||'Unable to preview this change.');setPreview(body)}catch(e){setWriteError(e instanceof Error?e.message:'Unable to preview')}finally{setBusy(false)}
 }
 async function confirm(){
  if(!preview||!token)return;setBusy(true);setWriteError('')
  try{const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({operation:preview.operation,initiative:payload(preview.initiative),previewId:preview.previewId,confirm:true})});const body=await response.json();if(!response.ok)throw Error(body.detail||body.error||body.message||'Save failed. Reload the record before retrying.');setDraft(null);setPreview(null);setMessage(preview.operation==='delete'?'Initiative deleted.':'Initiative published.');await load()}catch(e){setWriteError(e instanceof Error?e.message:'Save failed')}finally{setBusy(false)}
 }
 const text=(key:keyof Initiative,label:string,type='text',required=false)=><label key={key}>{label}<input type={type} value={String(draft?.[key]??'')} required={required} maxLength={type==='url'?2000:type==='text'?1000:undefined} onChange={e=>update(key,e.target.value)} /></label>
 const area=(key:keyof Initiative,label:string,required=false)=><label key={key}>{label}<textarea value={String(draft?.[key]??'')} required={required} maxLength={1000} rows={3} onChange={e=>update(key,e.target.value)} /></label>
 return <div ref={root} className="portal-ecosystem eco-page eco-secondary-view intervention-dashboard">
  <header className="eco-network-heading"><h1>Maryland interventions</h1><nav aria-label="Network views"><Link to="/ecosystem/network/performance">Performance</Link><Link to="/ecosystem/network/interventions" aria-current="page">Interventions</Link><Link to="/ecosystem/network/overview">Common data</Link><Link to="/ecosystem/network">Graph</Link><Link to="/ecosystem/network/nonprofits">Nonprofits</Link><Link to="/ecosystem/network/relationships">Evidence</Link></nav></header>
  <section className="eco-view-content" tabIndex={0} aria-label="Intervention dashboard">
   <div className="intervention-intro"><div><p className="eco-eyebrow">Outcomes → decisions → action → results</p><h2>Turn evidence into measurable change.</h2><p>Track the institution that can decide, the next decision window, the action your organization owns, and what actually changed.</p></div><button type="button" onClick={()=>{setDraft(newInitiative(managed[0]?.id));setPreview(null);setWriteError('');setMessage('')}}>Plan an initiative</button></div>
   <div className="intervention-metrics" aria-label="Initiative totals">{[[summary?.total,'Initiatives'],[summary?.proposed,'Proposed'],[summary?.active,'Active'],[summary?.overdue,'Overdue'],[summary?.completed,'Completed']].map(([value,label])=><div key={label}><strong>{value??'—'}</strong><span>{label}</span></div>)}</div>
   <p className="eco-note">Planning records are separate from common financial evidence. “Authorized” refers to the steward organization’s documented authorization, not automatic government approval. No initiatives are pre-approved or inferred from funding connections.</p>
   {error&&<p role="alert">{error} <button type="button" onClick={()=>void load().catch(e=>setError(e.message))}>Retry</button></p>}
   {message&&<p role="status">{message}</p>}
   {records===null&&!error&&<p role="status">Loading shared initiatives…</p>}
   <div className="eco-view-filters"><label>Search initiatives<input type="search" value={query} onChange={e=>{setQuery(e.target.value);setOffset(0)}} /></label><label>Work status<select value={filter} onChange={e=>{setFilter(e.target.value);setOffset(0)}}><option value="all">All initiatives</option><option value="overdue">Overdue</option>{initiativeStatuses.map(s=><option key={s} value={s}>{s}</option>)}</select></label></div>
   {records?.length===0&&<div className="intervention-empty"><h2>No initiatives published yet</h2><p>Start with one measurable outcome. Identify the decision-maker, collect baseline evidence, and propose the smallest consequential next action.</p></div>}
   {records&&records.length>0&&visible.length===0&&<p>No initiatives match these filters.</p>}
   <p>{total} matching initiatives</p><button disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous</button><button disabled={nextOffset===null} onClick={()=>setOffset(nextOffset!)}>Next</button>
   <div className="intervention-board">{visible.map(i=>{const progress=initiativeProgress(i),deadline=nextDeadline(i),late=deadline&&deadline<today()&&!['completed','paused'].includes(i.status);return <article className="intervention-card" key={i.id}>
    <div className="intervention-card-heading"><span className={`intervention-status status-${i.status}`}>{i.status}</span><span>{i.organizationName}</span>{late&&<strong className="intervention-overdue">Overdue</strong>}</div><h2>{i.title}</h2><p>{i.outcome}</p>
    <dl><dt>Measure</dt><dd>{i.metric} · {i.unit||'Unit not set'}</dd><dt>Baseline → target</dt><dd>{i.baseline??'Unknown'} → {i.target??'Unknown'} by {date(i.targetDate)}</dd><dt>Latest measurement</dt><dd>{i.current??'Not measured'}{i.current!==null&&i.measurementDate?` · ${date(i.measurementDate)}`:''}</dd><dt>Decision authority</dt><dd>{i.authority||'Not established'} · {i.instrument}{i.authoritySourceUrl&&<> · <a href={i.authoritySourceUrl} target="_blank" rel="noopener noreferrer">Authority source ↗</a></>}{i.authorityReferenceId&&<> · <Link to={`/ecosystem/network?org=${encodeURIComponent(i.authorityReferenceId)}`}>Common organization</Link></>}</dd><dt>Decision window</dt><dd>{date(i.decisionDate)}</dd><dt>Next action</dt><dd>{i.nextAction}</dd><dt>Action owner / due</dt><dd>{i.organizationName} · {date(i.actionDueDate)}</dd></dl>
    {progress!==null&&<label className="intervention-progress">Measured progress toward target <progress max={100} value={progress}/><span>{Math.round(progress)}%</span></label>}
    <details><summary>Evidence, assumptions and results</summary><h3>Facts · {i.evidenceStatus}</h3><p>{i.facts||'No facts recorded.'} {i.factSourceUrl&&<a href={i.factSourceUrl} target="_blank" rel="noopener noreferrer">Evidence ↗</a>}</p><p className="eco-note">Revision {i.revision} · Updated {i.updatedAt?new Date(i.updatedAt).toLocaleString():'date unavailable'}</p><h3>Working hypothesis</h3><p>{i.hypothesis||'Not recorded'}</p><h3>Constraints and dependencies</h3><p>{i.constraints||'Not recorded'}</p>{i.authorizationUrl&&<p><a href={i.authorizationUrl} target="_blank" rel="noopener noreferrer">Organization authorization ↗</a></p>}<h3>Observed result</h3><p>{i.result||'No result recorded.'} {i.resultSourceUrl&&<a href={i.resultSourceUrl} target="_blank" rel="noopener noreferrer">Result evidence ↗</a>}</p></details>
    {managed.some(o=>o.id===i.organizationId)&&<button type="button" onClick={()=>{setDraft({...i});setPreview(null);setWriteError('')}}>Edit initiative</button>}
   </article>})}</div>
   {draft&&<section className="intervention-editor" aria-label="Initiative editor"><div className="intervention-card-heading"><h2>{draft.revision?'Edit initiative':'New initiative'}</h2><button type="button" disabled={busy} onClick={()=>{setDraft(null);setPreview(null)}}>Close editor</button></div><p>Published plans are public. Use organization responsibilities and public evidence; leave private personal details out. Unsaved drafts stay only in this page.</p>
    {!token&&<p>Sign in as an organization owner or administrator to preview and publish. Sign in before entering a plan you intend to publish; leaving this page discards unsaved work.</p>}
    {accessError&&<p role="alert">{accessError}</p>}
    {token&&!accessError&&managed.length===0&&<p>No managed organizations are available for publishing.</p>}
    <form onSubmit={e=>void review(e)}><div className="intervention-form-grid">
     <label>Steward and action owner<select required disabled={draft.revision>0} value={draft.organizationId} onChange={e=>update('organizationId',e.target.value)}><option value="">Choose your organization</option>{managed.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
     {text('title','Initiative title','text',true)}{area('outcome','Measurable change sought',true)}{text('metric','Outcome metric','text',true)}{text('unit','Measurement unit')}
     {(['baseline','target','current'] as const).map(k=><label key={k}>{k==='current'?'Latest measurement':k==='baseline'?'Baseline value':'Target value'}<input type="number" step="any" value={draft[k]??''} onChange={e=>update(k,e.target.value===''?null:Number(e.target.value))}/></label>)}
     {text('measurementDate','Measurement date','date')}{text('baselineDate','Baseline date','date')}{text('targetDate','Target date','date')}
     <label>Find an institution<input type="search" value={directoryQuery} onChange={e=>setDirectoryQuery(e.target.value)} /></label>
     <label>Institution in common data<select value={draft.authorityReferenceId} onChange={e=>{const org=directory.find(o=>o.id===e.target.value);setDraft({...draft,authorityReferenceId:e.target.value,authority:org?.name||draft.authority});setPreview(null)}}><option value="">Unlinked / research needed</option>{draft.authorityReferenceId&&!directory.some(o=>o.id===draft.authorityReferenceId)&&<option value={draft.authorityReferenceId}>{draft.authority}</option>}{directory.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
     {text('authority','Office or institution with decision authority')}{text('authoritySourceUrl','Evidence of decision authority','url')}
     <label>Policy instrument<select value={draft.instrument} onChange={e=>update('instrument',e.target.value)}>{['legislation','regulation','budget','procurement','administrative','community'].map(s=><option key={s}>{s}</option>)}</select></label>{text('decisionDate','Next decision deadline','date')}
     {area('nextAction','Smallest consequential next action',true)}{text('actionDueDate','Action due date','date')}{area('constraints','Constraints and dependencies')}
     {area('facts','Documented facts')}{text('factSourceUrl','Fact source','url')}<label>Evidence review<select value={draft.evidenceStatus} onChange={e=>update('evidenceStatus',e.target.value)}><option value="unreviewed">Unreviewed</option><option value="reviewed">Reviewed by steward</option></select></label>{area('hypothesis','Working hypothesis')}
     <label>Initiative status<select value={draft.status} onChange={e=>update('status',e.target.value)}>{initiativeStatuses.map(s=><option key={s}>{s}</option>)}</select></label>{text('authorizationUrl','Organization authorization evidence','url')}{area('result','Observed result')}{text('resultSourceUrl','Result evidence','url')}
    </div><p>Authorized work requires reviewed evidence, decision authority, a baseline and target, a target date, a measurement unit, and an authorization source. Completed work also requires a measured result and evidence.</p><button type="submit" disabled={busy||!token||!managed.some(o=>o.id===draft.organizationId)}>Review public changes</button>{draft.revision>0&&<button type="button" disabled={busy} onClick={()=>void review(undefined,'delete')}>Review deletion</button>}</form>
    {writeError&&<p role="alert">{writeError}</p>}
    {preview&&<section className="intervention-preview" aria-label="Confirm initiative change"><h3>Review before {preview.operation==='delete'?'deleting':'publishing'}</h3><p><strong>{preview.initiative.title}</strong> · {preview.initiative.status} · {managed.find(o=>o.id===preview.initiative.organizationId)?.name}</p><p>{preview.initiative.outcome}</p><p>Next action: {preview.initiative.nextAction}</p><p>{preview.operation==='delete'?'This removes the initiative from the shared dashboard.':'The fields above will become a public planning record.'} Review expires {new Date(preview.expiresAt).toLocaleTimeString()}.</p><button type="button" disabled={busy} onClick={()=>void confirm()}>{busy?'Saving…':preview.operation==='delete'?'Confirm deletion':'Confirm publication'}</button><button type="button" disabled={busy} onClick={()=>setPreview(null)}>Cancel review</button></section>}
   </section>}
  </section>
 </div>
}
