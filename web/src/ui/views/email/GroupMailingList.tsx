import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { emailApi } from './emailApi'
import './emailCampaigns.css'

type Subscriber = {id:string;name:string;email:string;status:string;consent_source:string;consented_at:number|null;unsubscribed_at:number|null}
type Segment = {id:string;name:string;subscription_ids:string[]}
type Audit = {action:string;actor_user_id:string;record_count:number;created_at:number}

export function GroupMailingList({organizationId}:{organizationId:string}) {
  const { token }=useAuth()
  const [items,setItems]=useState<Subscriber[]>([]),[status,setStatus]=useState('all'),[offset,setOffset]=useState(0)
  const [hasMore,setHasMore]=useState(false),[exportEnabled,setExportEnabled]=useState(false),[selected,setSelected]=useState<string[]>([])
  const [segments,setSegments]=useState<Segment[]>([]),[segmentName,setSegmentName]=useState(''),[audit,setAudit]=useState<Audit[]>([])
  const [error,setError]=useState(''),[busy,setBusy]=useState(false)
  const base=`/groups/${encodeURIComponent(organizationId)}`
  async function refresh() {
    const [list,saved,history]=await Promise.all([
      emailApi<{items:Subscriber[];has_more:boolean;exports_enabled:boolean}>(token,`${base}/subscribers?status=${status}&offset=${offset}`),
      emailApi<Segment[]>(token,`${base}/segments`),emailApi<Audit[]>(token,`${base}/audit`),
    ])
    setItems(list.items);setHasMore(list.has_more);setExportEnabled(list.exports_enabled);setSegments(saved);setAudit(history)
  }
  useEffect(()=>{setItems([]);setSegments([]);setAudit([]);setSelected([]);setExportEnabled(false);setError('');void refresh().catch(err=>setError(err.message))},[organizationId,status,offset,token])
  async function act(action:()=>Promise<void>) {setBusy(true);setError('');try{await action();await refresh()}catch(err){setError(err instanceof Error?err.message:'Unable to complete action.')}finally{setBusy(false)}}
  return <section id="organization-mailing-list" className="portal-card portal-org-nav-target" aria-label="Group mailing list">
    <h2>Mailing list</h2><p>Only this group’s owners and organizers can access subscribers. Membership does not subscribe someone to email.</p>
    <Link className="btn-secondary" to={`/email?organization_id=${encodeURIComponent(organizationId)}`}>Compose campaign and review delivery history</Link>
    {error && <p role="alert">{error}</p>}
    <label>Subscription status <select value={status} disabled={busy} onChange={e=>{setStatus(e.target.value);setOffset(0)}}>
      <option value="all">All</option><option value="subscribed">Subscribed</option><option value="unsubscribed">Unsubscribed</option>
    </select></label>
    <div className="email-table"><table><thead><tr><th>Select</th><th>Subscriber</th><th>Status</th><th>Consent</th><th>Action</th></tr></thead><tbody>
      {items.map(person=><tr key={person.id}><td><input type="checkbox" aria-label={`Select ${person.email}`} disabled={busy||person.status!=='subscribed'} checked={selected.includes(person.id)} onChange={e=>setSelected(e.target.checked?[...selected,person.id]:selected.filter(id=>id!==person.id))}/></td>
        <td>{person.name}<br/>{person.email}</td><td>{person.status}</td><td>{person.consent_source}<br/>{person.consented_at?new Date(person.consented_at).toLocaleString():'Consent date not recorded'}
          {person.unsubscribed_at && <><br/>Unsubscribed {new Date(person.unsubscribed_at).toLocaleString()}</>}</td>
        <td>{person.status==='subscribed' && <button disabled={busy} onClick={()=>void act(async()=>{await emailApi(token,`${base}/subscribers/${person.id}/unsubscribe`,'POST');setSelected(ids=>ids.filter(id=>id!==person.id))})}>Unsubscribe</button>}</td></tr>)}
    </tbody></table></div>
    {!items.length && !error && <p>No subscribers in this view.</p>}
    <div className="email-actions"><button disabled={busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-100))}>Previous</button><button disabled={busy||!hasMore} onClick={()=>setOffset(offset+100)}>Next</button></div>
    <fieldset disabled={busy}><legend>Segments</legend><label>Segment name <input value={segmentName} maxLength={80} onChange={e=>setSegmentName(e.target.value)}/></label>
      <button disabled={!selected.length||!segmentName.trim()} onClick={()=>void act(async()=>{await emailApi(token,`${base}/segments`,'POST',{name:segmentName,subscription_ids:selected});setSegmentName('');setSelected([])})}>Save selected subscribers as segment</button>
      {segments.map(segment=><p key={segment.id}>{segment.name} <button onClick={()=>void act(async()=>{await emailApi(token,`${base}/segments/${segment.id}`,'DELETE')})}>Delete segment</button></p>)}
    </fieldset>
    {exportEnabled && <button disabled={busy} onClick={()=>void act(async()=>{
      const csv=await emailApi<string>(token,`${base}/export`)
      const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download='group-subscribers.csv';a.click();URL.revokeObjectURL(url)
    })}>Export CSV</button>}
    <details><summary>Mailing-list activity</summary><ul>{audit.map((row,index)=><li key={index}>{new Date(row.created_at).toLocaleString()} · {row.action} · Account {row.actor_user_id}{row.record_count?` · ${row.record_count} records`:''}</li>)}</ul></details>
  </section>
}

export function GroupEmailPreference({organizationId}:{organizationId:string}) {
  const {token}=useAuth(),[subscribed,setSubscribed]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{setReady(false);setError('');emailApi<{status:string}>(token,`/groups/${organizationId}/subscription`).then(row=>{setSubscribed(row.status==='subscribed');setReady(true)}).catch(err=>setError(err.message))},[organizationId,token])
  return <section className="portal-card" aria-label="Your group email preference"><h2>Group announcements</h2><p>Choose whether to receive this group’s emails. Your membership is unchanged.</p>
    {error && <p role="alert">{error}</p>}
    <label><input type="checkbox" checked={subscribed} disabled={!ready||busy} onChange={async e=>{const next=e.target.checked;setBusy(true);setError('');try{await emailApi(token,`/groups/${organizationId}/subscription`,'PUT',{subscribed:next});setSubscribed(next)}catch(err){setError(err instanceof Error?err.message:'Unable to save preference.')}finally{setBusy(false)}}}/> Receive announcements from this group</label>
  </section>
}
