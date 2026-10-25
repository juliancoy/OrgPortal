import {useEffect,useRef,useState} from 'react'
import {Link} from 'react-router-dom'
import Star from 'lucide-react/dist/esm/icons/star.mjs'
import './event-standings.css'
type Submission={submission_id:string;organization_name:string;organization_slug:string;title:string;status:string;favorites:number}
type Round={phase:'shortlist'|'open'|'closed';results:{submission_id:string;votes:number}[]}
export function EventStandings({eventId,eventSlug,lazy=false}:{eventId:string;eventSlug:string;lazy?:boolean}){
 const root=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(!lazy),[rows,setRows]=useState<Submission[]|null>(null),[enabled,setEnabled]=useState(false),[round,setRound]=useState<Round|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{if(!lazy){setVisible(true);return}const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect()}},{rootMargin:'160px'});if(root.current)observer.observe(root.current);return()=>observer.disconnect()},[lazy,eventId])
 useEffect(()=>{
  if(!visible)return
  const controller=new AbortController();setRows(null);setEnabled(false);setRound(null);setError('')
  const base=`/api/org/api/network/events/${encodeURIComponent(eventId)}/presentations`
  async function get(path:string){const response=await fetch(base+path,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error('Submission standings are unavailable.');return response.json()}
  void (async()=>{
   const settings=await get('/public');if(controller.signal.aborted||!settings.enabled)return;setEnabled(true)
   const submissions:Submission[]=[];let cursor:string|null=null
   do{const page=await get('/submissions'+(cursor?'?after='+encodeURIComponent(cursor):''));submissions.push(...page.submissions);cursor=page.next}while(cursor&&!controller.signal.aborted)
   const finalRound:Round=await get('/final-round')
   if(!controller.signal.aborted){setRows([...new Map(submissions.filter(row=>row.status!=='declined').map(row=>[row.submission_id,row])).values()]);setRound(finalRound)}
  })().catch(reason=>{if(!controller.signal.aborted)setError(reason.message)})
  return()=>controller.abort()
 },[eventId,visible,revision])
 const Heading=lazy?'h3':'h2'
 const votingPath=`/events/${encodeURIComponent(eventSlug)}?tab=submissions#submissions`,final=Boolean(round&&round.phase!=='shortlist')
 const votes=new Map(round?.results.map(row=>[row.submission_id,row.votes])||[])
 const sorted=[...(rows||[])].sort((a,b)=>(final?(votes.get(b.submission_id)??-1)-(votes.get(a.submission_id)??-1):b.favorites-a.favorites)||a.organization_name.localeCompare(b.organization_name)||a.title.localeCompare(b.title)||a.submission_id.localeCompare(b.submission_id))
 const score=(row:Submission)=>final?votes.get(row.submission_id)??-1:row.favorites
 return <div ref={root} className="event-standings-slot">{(enabled||error)&&<section className="event-standings" aria-label="Current submissions and vote standings">
  <header><Heading>Current submissions &amp; standings</Heading><Link to={votingPath}>View submissions &amp; vote</Link></header>
  {error?<p role="alert">{error} <button type="button" className="btn-secondary" onClick={()=>setRevision(value=>value+1)}>Retry standings</button></p>:!rows?<p role="status">Loading standings…</p>:<>
   <p className="event-standings-caption">{final?`Final-round votes · ${round?.phase==='closed'?'Voting closed':'Voting open'}. Stars show preliminary favorites.`:'Ranked by current stars. Each favorite vote adds one star.'}</p>
   {!sorted.length?<p>No submissions yet.</p>:<ol className="event-standings-list">{sorted.map(row=><li key={row.submission_id}>
    <span className="event-standing-rank" aria-label={score(row)<0?'Not a finalist':`Rank ${sorted.findIndex(other=>score(other)===score(row))+1}`}>{score(row)<0?'—':sorted.findIndex(other=>score(other)===score(row))+1}</span>
    <span className="event-standing-entry"><Link to={`/orgs/${encodeURIComponent(row.organization_slug)}`}><strong>{row.organization_name}</strong></Link><Link to={votingPath}>{row.title}</Link></span>
    <span className="event-standing-score">{final&&<strong>{votes.has(row.submission_id)?`${votes.get(row.submission_id)} votes`:'Not a finalist'}</strong>}<span aria-label={`${row.favorites} ${row.favorites===1?'star':'stars'}`}><Star size={16} fill="currentColor" aria-hidden="true"/>{row.favorites.toLocaleString()}</span></span>
   </li>)}</ol>}
  </>}
 </section>}</div>
}
