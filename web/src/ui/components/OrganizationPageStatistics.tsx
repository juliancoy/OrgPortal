import { useEffect, useState } from 'react'
import './OrganizationPageStatistics.css'

type Report={total:number;today:number;last_7_days:number;last_30_days:number;first_day:string|null;daily:{day:string;views:number}[]}
export function OrganizationPageStatistics({organizationId,token}:{organizationId:string;token:string}) {
 const [open,setOpen]=useState(false),[days,setDays]=useState('30'),[revision,setRevision]=useState(0)
 const [report,setReport]=useState<Report|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false)
 useEffect(()=>{
  if(!open)return
  const controller=new AbortController();setReport(null);setError('');setLoading(true)
  void fetch(`/api/org/api/network/orgs/${encodeURIComponent(organizationId)}/page-statistics?days=${days}`,{
   headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal,
  }).then(async response=>{
   if(!response.ok)throw new Error('Page statistics are unavailable. Try again later.')
   const data=await response.json();if(!controller.signal.aborted)setReport(data)
  }).catch(reason=>{if(!controller.signal.aborted)setError(reason.message)})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return()=>controller.abort()
 },[organizationId,token,open,days,revision])
 return <details className="organization-page-statistics" onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>Statistics</summary>
  {open&&<section aria-label="Organization page statistics">
   <h2>Organization page views</h2>
   <p className="muted">Views of the public organization page across its tabs. Reloads and return visits count again; tab changes and dashboard visits do not. These are page views, not unique people.</p>
   <div className="organization-statistics-toolbar"><label>Daily breakdown<select value={days} onChange={event=>setDays(event.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">365 days</option></select></label><button type="button" className="btn-secondary" disabled={loading} onClick={()=>setRevision(value=>value+1)}>Refresh page statistics</button></div>
   {loading&&<p role="status">Loading page statistics…</p>}
   {error&&<p role="alert">{error}</p>}
   {report&&<>
    <dl className="organization-statistics-totals">{[['Since tracking began',report.total],['Last 30 days',report.last_30_days],['Last 7 days',report.last_7_days],['Today',report.today]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{Number(value).toLocaleString()}</dd></div>)}</dl>
    <p className="muted">{report.first_day?`Tracking since ${report.first_day}.`:'No page views recorded yet.'} Daily counts use UTC and include today. Earlier traffic is not backfilled.</p>
    <div className="organization-statistics-table"><table><caption>Daily page views</caption><thead><tr><th scope="col">Date (UTC)</th><th scope="col">Page views</th></tr></thead><tbody>{report.daily.map(row=><tr key={row.day}><th scope="row">{row.day}</th><td>{row.views.toLocaleString()}</td></tr>)}</tbody></table></div>
    <p className="muted">No visitor identities, IP addresses, referrers, or tracking cookies are stored in these counters. Known crawlers are filtered; blocked JavaScript and automated traffic can affect counts.</p>
   </>}
  </section>}
 </details>
}
