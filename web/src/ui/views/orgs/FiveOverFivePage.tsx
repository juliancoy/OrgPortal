import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import Award from 'lucide-react/dist/esm/icons/award.mjs'
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left.mjs'
import Plus from 'lucide-react/dist/esm/icons/plus.mjs'
import Star from 'lucide-react/dist/esm/icons/star.mjs'
import Users from 'lucide-react/dist/esm/icons/users.mjs'
import { useAuth } from '../../../app/AppProviders'
import './five-over-five.css'

type Nominee={id:string;name:string;accomplishment:string;connection:string;profile_url:string|null;votes:number}
type Listing={organization:{name:string;slug:string};nominees:Nominee[];limit:number}
export function FiveOverFivePage(){
 const {handle='code-collective'}=useParams(),{token}=useAuth()
 const base=`/api/org/api/network/orgs/${encodeURIComponent(handle)}/five-over-five`
 const [data,setData]=useState<Listing|null>(null),[selected,setSelected]=useState<string[]>([]),[owned,setOwned]=useState<string[]>([]),[moderator,setModerator]=useState(false)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0)
 async function request(path:string,options:RequestInit={},signal?:AbortSignal){
  const response=await fetch(base+path,{...options,signal,cache:'no-store',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}})
  const result=await response.json();if(!response.ok)throw new Error(result.message||result.error||'Could not complete the request.');return result
 }
 useEffect(()=>{
  const controller=new AbortController();setData(null);setSelected([]);setOwned([]);setModerator(false);setError('')
  void Promise.all([request('',{},controller.signal),token?request('/mine',{},controller.signal):Promise.resolve({selections:[],owned:[],canModerate:false})]).then(([listing,mine])=>{
   if(controller.signal.aborted)return;setData(listing);setSelected(mine.selections);setOwned(mine.owned);setModerator(mine.canModerate)
  }).catch(reason=>{if(!controller.signal.aborted)setError(reason.message)})
  return()=>controller.abort()
 // Request dependencies are base and token.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[base,token,revision])
 async function saveVote(id:string){
  if(!data||busy)return;setBusy(true);setError('');setNotice('')
  try{await request('/ballot',{method:'PUT',body:JSON.stringify({selections:selected.includes(id)?selected.filter(value=>value!==id):[...selected,id]})});setNotice('Your votes are saved.');setRevision(value=>value+1)}catch(reason){setError(reason instanceof Error?reason.message:'Could not save votes.')}finally{setBusy(false)}
 }
 async function nominate(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const form=event.currentTarget,fields=new FormData(form);setBusy(true);setError('');setNotice('')
  try{await request('/nominees',{method:'POST',body:JSON.stringify({name:fields.get('name'),accomplishment:fields.get('accomplishment'),connection:fields.get('connection'),profileUrl:fields.get('profileUrl')||null,eligible:fields.get('eligible')==='on',consent:fields.get('consent')==='on'})});form.reset();setNotice('Nomination published.');setRevision(value=>value+1)}catch(reason){setError(reason instanceof Error?reason.message:'Could not publish nomination.')}finally{setBusy(false)}
 }
 async function remove(id:string){
  if(!window.confirm('Remove this nomination and its votes?'))return;setBusy(true);setError('')
  try{await request(`/nominees/${id}`,{method:'DELETE'});setNotice('Nomination removed.');setRevision(value=>value+1)}catch(reason){setError(reason instanceof Error?reason.message:'Could not remove nomination.')}finally{setBusy(false)}
 }
 const title=data?.organization.name||(handle==='code-collective'?'Code Collective':'Community')
 return <section className="panel five-over-five">
  <Link className="five-back" to={`/orgs/${encodeURIComponent(handle)}`}><ArrowLeft size={17} aria-hidden="true" />{title}</Link>
  <header className="five-hero"><div><p className="tenant-home-eyebrow"><Award size={18} aria-hidden="true" />{title} honors</p><h1>Five over Five<span>.</span></h1><p className="five-intro">Big accomplishments. Delightfully low age threshold.</p><p>Celebrate five accomplished individuals in our orbit who are older than five years. Nominate the people whose work, generosity, and ideas make this community better.</p><a className="btn-primary" href="#nominate"><Plus size={18} aria-hidden="true" />Nominate someone</a></div><div className="five-emblem" aria-hidden="true"><span>5</span><small>OVER</small><span>5</span></div></header>
  <div className="five-rules"><p><Users size={18} aria-hidden="true" />Open nominations · People, not companies</p><p><Star size={18} aria-hidden="true" />Vote for 25% of nominees, rounded up{data?` · ${data.limit} ${data.limit===1?'choice':'choices'} among ${data.nominees.length}`:''}</p></div>
  <p>Each signed-in person gets one editable ballot. Nominees must be older than five and connected to the community. Share a specific accomplishment and how they’re in our orbit. Nominee details and vote totals are public; individual ballots are private.</p>
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error} <button className="btn-secondary" onClick={()=>setRevision(value=>value+1)}>Refresh</button></p>}
  {!data&&!error&&<p role="status">Loading nominations…</p>}
  {data&&<><section aria-labelledby="five-leaders"><h2 id="five-leaders">The current five</h2><p>Live leaders, not final award recipients. Ties share a rank; equal scores appear in nomination order.</p><div className="five-leaders">{Array.from({length:5},(_,i)=>{
   const person=data.nominees.filter(row=>row.votes>0)[i];return <div className="five-leader" key={i}><span className="five-rank">{person?1+data.nominees.filter(row=>row.votes>person.votes).length:String(i+1).padStart(2,'0')}</span><strong>{person?.name||'A place for someone great'}</strong><small>{person?`${person.votes} ${person.votes===1?'vote':'votes'}`:'Nominate and vote below'}</small></div>
  })}</div></section>
  <section aria-labelledby="five-nominees"><h2 id="five-nominees">Meet the nominees</h2>{token?<p>{selected.length} of {data.limit} choices saved. Select a star to vote; select it again to withdraw.</p>:<p><Link to={`/users/login?next=${encodeURIComponent(`/orgs/${handle}/five-over-five`)}`}>Sign in to nominate and vote</Link>.</p>}
   {!data.nominees.length&&<div className="five-empty">Every great shortlist starts with a first nomination. Who comes to mind?</div>}
   <div className="five-grid">{data.nominees.map(row=><article className="five-nominee" key={row.id}><div className="five-person"><span className="five-avatar" aria-hidden="true">{row.name.split(/\s+/).slice(0,2).map(part=>part[0]).join('')}</span><div><h3>{row.name}</h3><span>{row.votes} {row.votes===1?'vote':'votes'}</span></div></div><h4>The accomplishment</h4><p className="five-prose">{row.accomplishment}</p><h4>In our orbit</h4><p className="five-prose">{row.connection}</p>{row.profile_url&&<a href={row.profile_url} target="_blank" rel="noopener noreferrer">Explore their work ↗</a>}<div className="five-card-actions"><button type="button" className={selected.includes(row.id)?'btn-primary':'btn-secondary'} aria-pressed={selected.includes(row.id)} aria-label={`Vote for ${row.name}`} disabled={!token||busy||(!selected.includes(row.id)&&selected.length>=data.limit)} onClick={()=>void saveVote(row.id)}><Star size={17} fill={selected.includes(row.id)?'currentColor':'none'} aria-hidden="true" />{selected.includes(row.id)?'Voted':'Vote'}</button>{(moderator||owned.includes(row.id))&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>void remove(row.id)}>Remove nomination</button>}</div></article>)}</div>
  </section></>}
  <section id="nominate" className="five-nomination" aria-labelledby="five-nominate"><h2 id="five-nominate">Put someone in the spotlight</h2><p>No résumé theater. Tell us what they’ve done and why it matters.</p>{token?<form onSubmit={event=>void nominate(event)}><label>Nominee’s name<input name="name" required maxLength={120} autoComplete="off" /></label><label>What have they accomplished?<textarea name="accomplishment" required maxLength={2000} rows={4} /></label><label>How are they in our orbit?<textarea name="connection" required maxLength={500} rows={2} /></label><label>Profile or work link (optional)<input name="profileUrl" type="url" pattern="https://.*" placeholder="https://" maxLength={1000} /></label><label className="five-check"><input name="eligible" type="checkbox" required />They are older than five years.</label><label className="five-check"><input name="consent" type="checkbox" required />I have permission to publish these details.</label><p className="muted">Share public professional information. No private contact details or dates of birth. Nominations and ballots expire after one year. You can remove your nomination or withdraw votes at any time.</p><button type="submit" className="btn-primary" disabled={busy}><Plus size={18} aria-hidden="true" />{busy?'Saving…':'Publish nomination'}</button></form>:<Link className="btn-primary" to={`/users/login?next=${encodeURIComponent(`/orgs/${handle}/five-over-five#nominate`)}`}>Sign in to nominate</Link>}</section>
 </section>
}
