import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'
import './mcp-live-statistics.css'
type Row={day:string;stage:string;outcome:string;requests:number;total_ms:number;max_ms:number}
type Report={source:string;days:number;start:string;asOf:string;rows:Row[]}
type Source={report:Report|null;error:string|null}
const failures=new Set(['server_error','client_error','tool_error'])
const label=(value:string)=>value.replaceAll('_',' ').replaceAll('/',' / ')
function SourceStatistics({title,value}:{title:string;value:Source}){
 const data=value.report
 if(!data)return <section className="mcp-live-source"><h3>{title}</h3><p role={value.error?'status':undefined}>{value.error||'Loading live counters…'}</p></section>
 const count=(filter:(row:Row)=>boolean)=>data.rows.filter(filter).reduce((sum,row)=>sum+Number(row.requests),0)
 const total=count(()=>true),errors=count(row=>failures.has(row.outcome)),rejected=count(row=>['denied','rejected','token_rejected','rate_limited','consent_denied'].includes(row.outcome)),challenges=count(row=>row.outcome==='auth_required')
 const avg=total?Math.round(data.rows.reduce((sum,row)=>sum+Number(row.total_ms),0)/total):null
 const stages=[...new Set(data.rows.map(row=>row.stage))]
 const daily=Array.from({length:data.days},(_,index)=>{const day=new Date(Date.parse(data.start+'T00:00:00Z')+index*86400000).toISOString().slice(0,10);return {day,requests:count(row=>row.day===day),errors:count(row=>row.day===day&&failures.has(row.outcome))}})
 const max=Math.max(1,...daily.map(row=>row.requests))
 return <section className="mcp-live-source"><h3>{title}</h3><div className="mcp-live-totals">
  <div><span>Requests</span><strong>{total.toLocaleString()}</strong></div><div><span>Request / tool errors</span><strong>{errors.toLocaleString()}</strong></div><div><span>Rejected / denied / limited</span><strong>{rejected.toLocaleString()}</strong></div><div><span>Auth challenges</span><strong>{challenges.toLocaleString()}</strong></div><div><span>Average response</span><strong>{avg===null?'—':`${avg} ms`}</strong></div>
 </div>
 {!total?<p className="muted">No recorded activity in this window. Counters start when collection is enabled; historical traffic is not backfilled.</p>:<>
  <div className="mcp-live-trend" role="img" aria-label={`${title}: ${total} requests, ${errors} request or tool errors in the selected period. Daily values are available in the table below.`}>{daily.map(row=><div key={row.day} title={`${row.day}: ${row.requests} requests, ${row.errors} errors`}><span style={{height:`${row.requests/max*100}%`}} /><small>{row.day.slice(8)}</small></div>)}</div>
  <div className="mcp-live-table"><table><caption>Activity by stage</caption><thead><tr><th>Stage</th><th>Requests</th><th>Errors</th><th>Average</th><th>Slowest</th></tr></thead><tbody>{stages.map(stage=>{
   const rows=data.rows.filter(row=>row.stage===stage),requests=rows.reduce((sum,row)=>sum+Number(row.requests),0)
   return <tr key={stage}><th>{label(stage)}</th><td>{requests}</td><td>{rows.filter(row=>failures.has(row.outcome)).reduce((sum,row)=>sum+Number(row.requests),0)}</td><td>{Math.round(rows.reduce((sum,row)=>sum+Number(row.total_ms),0)/requests)} ms</td><td>{Math.max(...rows.map(row=>Number(row.max_ms)))} ms</td></tr>
  })}</tbody></table></div>
  <details><summary>Daily counts and outcomes</summary><div className="mcp-live-table"><table><thead><tr><th>UTC date</th><th>Requests</th><th>Errors</th></tr></thead><tbody>{daily.map(row=><tr key={row.day}><th>{row.day}</th><td>{row.requests}</td><td>{row.errors}</td></tr>)}</tbody></table><table><thead><tr><th>Outcome</th><th>Requests</th></tr></thead><tbody>{[...new Set(data.rows.map(row=>row.outcome))].map(outcome=><tr key={outcome}><th>{label(outcome)}</th><td>{count(row=>row.outcome===outcome)}</td></tr>)}</tbody></table></div></details>
 </>}
 <p className="muted">Updated {new Date(data.asOf).toLocaleTimeString()}. UTC calendar days, including today’s partial day.</p>
 </section>
}
export function McpLiveStatistics({token}:{token:string}){
 const [days,setDays]=useState('7'),[refresh,setRefresh]=useState(0),[sources,setSources]=useState<{mcp:Source;oauth:Source}>({mcp:{report:null,error:null},oauth:{report:null,error:null}})
 useEffect(()=>{
  const controller=new AbortController();let loading=false
  setSources({mcp:{report:null,error:null},oauth:{report:null,error:null}})
  const read=async(path:string):Promise<Source>=>{try{
   const request=(value:string)=>fetch(path,{headers:{Authorization:`Bearer ${value}`},credentials:'include',cache:'no-store',signal:controller.signal})
   let response=await request(token)
   if(response.status===401){const fresh=await refreshRuntimeTokenFromSession();if(fresh&&!controller.signal.aborted)response=await request(fresh)}
   if(!response.ok)throw new Error(response.status===403?'Primary administrator access is required.':'Live counters are unavailable. The service or statistics migration may not be released yet.')
   const report=await response.json() as Report;if(!Array.isArray(report.rows))throw new Error('Live counters are not available from this service yet.')
   return {report,error:null}
  }catch(error){return {report:null,error:error instanceof Error?error.message:'Unable to load counters'}}}
  const load=async()=>{if(loading)return;loading=true;const [mcp,oauth]=await Promise.all([read(`/api/org/api/admin/mcp-statistics?days=${days}`),read(`/pidp/admin/oauth-statistics?days=${days}`)]);if(!controller.signal.aborted)setSources({mcp,oauth});loading=false}
  void load();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load()},30000)
  const focus=()=>void load();window.addEventListener('focus',focus)
  return()=>{controller.abort();window.clearInterval(timer);window.removeEventListener('focus',focus)}
 },[token,days,refresh])
 return <section className="portal-card mcp-live-statistics" aria-label="Live MCP and OAuth statistics"><header><div><h2>Live MCP & OAuth</h2><p>Observed service activity across tenants. These counters are not test results or unique-user counts.</p></div><div className="mcp-live-controls"><label>Period<select aria-label="Live statistics period" value={days} onChange={event=>setDays(event.target.value)}><option value="1">Today</option><option value="7">7 days</option><option value="30">30 days</option></select></label><button type="button" className="btn-secondary" onClick={()=>setRefresh(value=>value+1)}>Refresh</button></div></header>
 <p className="muted">Refreshes every 30 seconds while visible. Initial authentication challenges and consent denials are shown separately from errors. Redirects are requests, not proof of a completed sign-in. Token exchanges and refreshes are combined.</p>
 <SourceStatistics title="MCP server" value={sources.mcp}/><SourceStatistics title="OAuth & provider sign-in" value={sources.oauth}/>
 <Link to="/test-status">View automated test status</Link>
 </section>
}
