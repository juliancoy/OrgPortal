import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { OrganizationFunds } from './OrganizationFunds'
import { agencyExpenditure, fundingGroup, rankFunding, type FundingReport, type FundingRow } from './fundingDashboard'
import './organization-money-dashboard.css'

const money = (value: number, currency = 'USD') => currency === 'USD'
 ? new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:0}).format(value)
 : `${value.toLocaleString()} ${currency}`
const colors = ['#147d92','#6954bd','#c67920','#36814d','#b24f70','#4879bd','#987344','#65757d']
const safeSource = (url?: string) => url && /^https?:\/\//i.test(url) ? url : undefined
function Pie({ title, rows, currency }: { title: string; rows: { name: string; amount: number }[]; currency: string }) {
 const positive = rows.filter(row=>row.amount>0)
 const total = positive.reduce((sum,row)=>sum+row.amount,0)
 const slices = positive.length > 8 ? [...positive.slice(0,7),{name:'Other',amount:positive.slice(7).reduce((sum,row)=>sum+row.amount,0)}] : positive
 let offset = 0
 return <section className="money-pie"><h3>{title}</h3>{total ? <>
  <svg viewBox="0 0 120 120" role="img" aria-label={`${title}: ${money(total,currency)} across ${positive.length} organizations`}>
   {slices.map((slice,index)=>{const fraction=slice.amount/total; const start=offset; offset+=fraction; return <circle key={slice.name} cx="60" cy="60" r="43" fill="none" stroke={colors[index]} strokeWidth="18" pathLength="100" strokeDasharray={`${fraction*100} ${100-fraction*100}`} strokeDashoffset={-start*100} transform="rotate(-90 60 60)"><title>{slice.name}: {money(slice.amount,currency)} ({(fraction*100).toFixed(1)}%)</title></circle>})}
   <text x="60" y="57" textAnchor="middle" className="money-pie-number">{positive.length}</text><text x="60" y="72" textAnchor="middle" className="money-pie-caption">organizations</text>
  </svg>
  <ul>{slices.map((slice,index)=><li key={slice.name}><span className="money-dot" style={{background:colors[index]}} /><span>{slice.name}</span><strong>{money(slice.amount,currency)}</strong></li>)}</ul>
 </> : <p className="muted">No disclosed amounts in this category.</p>}</section>
}
function AmountCard({ title, rows, currency }: { title: string; rows: FundingRow[]; currency: string }) {
 const known=rows.filter(row=>row.amount!==null), unknown=rows.reduce((sum,row)=>sum+row.undisclosedCount,0)
 return <div className="money-stat"><span>{title}</span><strong className={known.length?undefined:'money-unknown'}>{known.length ? `${rows.some(row=>row.lowerBoundCount>0)?'At least ':''}${money(known.reduce((sum,row)=>sum+(row.amount || 0),0),currency)}` : 'Not recorded'}</strong><small>{rows.reduce((sum,row)=>sum+row.recordCount,0)} source records{unknown>0?` · ${unknown} undisclosed`:''}</small></div>
}
export function OrganizationMoneyDashboard({ report }: { report: FundingReport }) {
 const [scope,setScope]=useState(report.organization.slug), [related,setRelated]=useState<FundingReport | null>(null), [error,setError]=useState('')
 const [group,setGroup]=useState(''), [year,setYear]=useState<number | null>(null)
 const agencies=useMemo(()=>[...new Map((report.fundingFacts?.records || []).filter(f=>f.fact_type==='agency_expenditure').flatMap(f=>{
  const row=report.records.find(r=>r.record_id===f.support_record_id)
  return row?.to_organization_slug && row.to_organization_id!==report.organization.id ? [[row.to_organization_slug,{slug:row.to_organization_slug,name:row.to_label || row.to_organization_slug}] as const] : []
 })).values()],[report])
 useEffect(()=>{setScope(report.organization.slug);setRelated(null)},[report.organization.slug])
 useEffect(()=>{
  setGroup('');setYear(null);setRelated(null);setError('')
  if(scope===report.organization.slug)return
  const abort=new AbortController()
  void fetch(`/api/org/api/network/orgs/public/${encodeURIComponent(scope)}/support`,{signal:abort.signal}).then(async response=>{
   if(!response.ok)throw Error('This agency dashboard could not load.')
   const value=await response.json() as FundingReport
   if(!value.financialTotals || !Array.isArray(value.records))throw Error('Funding records are incomplete.')
   if(!abort.signal.aborted)setRelated(value)
  }).catch(reason=>{if(!abort.signal.aborted)setError(reason.message)})
  return ()=>abort.abort()
 },[scope,report.organization.slug])
 const active=scope===report.organization.slug?report:related
 if(!active)return <section className="money-dashboard"><h2>Money dashboard</h2><p role="status">{error || 'Loading agency funding…'}</p><button onClick={()=>setScope(report.organization.slug)}>Back to {report.organization.name}</button></section>
 const groups=[...new Map(active.financialTotals.entries.map(row=>[fundingGroup(row),row])).entries()]
 const selected=groups.some(([key])=>key===group)?group:groups.find(([,row])=>row.currency==='USD'&&row.status==='delivered')?.[0] || groups.find(([,row])=>row.currency==='USD')?.[0] || groups[0]?.[0] || ''
 const basis=groups.find(([key])=>key===selected)?.[1], currency=basis ? basis.currency || 'Unspecified currency' : 'USD'
 const outgoingTitle=basis?.financialFactType==='obligation'?'Money obligated':basis?.status==='reported' || basis?.financialFactType==='reported_award'?'Reported money deployed':'Money spent'
 const incomingTitle=basis?.financialFactType==='obligation'?'Incoming obligations':basis?.status==='reported' || basis?.financialFactType==='reported_award'?'Reported money received':'Money received'
 const received=rankFunding(active.financialTotals.counterparties,'received',selected), spent=rankFunding(active.financialTotals.counterparties,'deployed',selected)
 const years=[...new Set((active.fundingFacts?.records || []).filter(f=>f.fact_type==='agency_expenditure'&&f.fiscal_year!==null).map(f=>f.fiscal_year!))].sort((a,b)=>b-a)
 const selectedYear=year!==null&&years.includes(year)?year:years[0]
 const expenditure=selectedYear?agencyExpenditure(active,selectedYear):[]
 const groupLabel=(row:FundingRow)=>`${row.currency || 'Unknown currency'} · ${row.status==='delivered'?'Documented delivery':'Reported'} · ${row.fiscalYear?`FY${row.fiscalYear}`:'All tracked dates'} · ${(row.measurement || 'unspecified measurement').replaceAll('_',' ')} · ${(row.financialFactType || 'unclassified').replaceAll('_',' ')}`
 return <section className="money-dashboard" aria-label="Organization money dashboard">
  <header><p className="money-eyebrow">TRACKED FINANCIAL ACTIVITY</p><h2>Money dashboard</h2><p>{active.organization.name} · Source-backed amounts currently tracked</p></header>
  <div className="money-controls">{agencies.length>0&&<label>Organization or tracked agency<select value={scope} onChange={event=>setScope(event.target.value)}><option value={report.organization.slug}>{report.organization.name}</option>{agencies.map(agency=><option key={agency.slug} value={agency.slug}>{agency.name}</option>)}</select></label>}
   {groups.length>0&&<label>Financial records<select value={selected} onChange={event=>setGroup(event.target.value)}>{groups.map(([key,row])=><option key={key} value={key}>{groupLabel(row)}</option>)}</select></label>}
  </div>
  <div className="money-stats"><AmountCard title={outgoingTitle} rows={active.financialTotals.entries.filter(row=>fundingGroup(row)===selected&&row.direction==='deployed')} currency={currency}/><AmountCard title={incomingTitle} rows={active.financialTotals.entries.filter(row=>fundingGroup(row)===selected&&row.direction==='received')} currency={currency}/><div className="money-stat"><span>Ranked recipients</span><strong>{spent.length}</strong><small>Within the selected financial records</small></div>{expenditure.length>0&&<div className="money-stat"><span>Tracked agency expenditure · FY{selectedYear}</span><strong>{money(expenditure.reduce((sum,row)=>sum+row.amount,0))}</strong><small>Published expenditure totals, separate from payments</small></div>}</div>
  <p className="money-coverage">{basis?groupLabel(basis):'No tracked monetary transfers or awards for this organization.'} Amounts reflect our tracked evidence, not complete accounts or balances. Announced awards do not establish payment. Currencies, fiscal years and measurements remain separate.</p>
  {groups.length>0&&<div className="money-pies"><Pie title="Money deployed by recipient" rows={spent.map(row=>({name:row.name || 'Unnamed recipient',amount:row.amount || 0}))} currency={currency}/><Pie title="Money received by funder" rows={received.map(row=>({name:row.name || 'Unnamed funder',amount:row.amount || 0}))} currency={currency}/></div>}
  <h3>Major recipients</h3><p className="muted">Highest tracked amount first. Undisclosed amounts appear last.</p>{spent.length?<div className="support-table-scroll"><table className="finance-table"><thead><tr><th>Rank</th><th>Recipient</th><th>Amount</th><th>Records</th></tr></thead><tbody>{spent.map((row,index)=><tr key={row.counterpartKey || `${row.name}-${index}`}><td>{index+1}</td><td>{row.slug?<Link to={`/orgs/${encodeURIComponent(row.slug)}`}>{row.name}</Link>:row.name}</td><td>{row.amount===null?'Undisclosed':`${row.lowerBoundCount?'At least ':''}${money(row.amount,currency)}`}</td><td>{row.recordCount}</td></tr>)}</tbody></table></div>:<p>No recipient-level monetary amounts are recorded in this category.</p>}
  {years.length>0&&<section className="money-expenditure"><h3>Tracked agency expenditure</h3><label>Fiscal year<select value={selectedYear} onChange={event=>setYear(Number(event.target.value))}>{years.map(value=><option key={value} value={value}>FY{value}</option>)}</select></label><p className="muted">Published agency expenditure totals. These are separate from recipient payments and are not added to the amounts above. Coverage includes only agencies represented in our records.</p><div className="money-stats"><div className="money-stat"><span>Recorded expenditure · FY{selectedYear}</span><strong>{expenditure.length?money(expenditure.reduce((sum,row)=>sum+row.amount,0)):'Not recorded'}</strong></div></div><Pie title={`Expenditure by agency · FY${selectedYear}`} rows={expenditure} currency="USD"/><ol className="money-agencies">{expenditure.map(row=><li key={row.name}>{row.slug?<Link to={`/orgs/${row.slug}`}>{row.name}</Link>:row.name}<strong>{money(row.amount)}</strong>{safeSource(row.source)&&<a href={safeSource(row.source)} target="_blank" rel="noreferrer">Source</a>}</li>)}</ol></section>}
  <h3>Specific funds and programs</h3><p className="muted">Program limits describe availability, not amounts paid. {agencies.length>0?'Choose a tracked agency above to explore its funds and recipients.':''}</p>{active.fundingPrograms?.records.length?<div className="money-programs">{active.fundingPrograms.records.map(program=><article key={program.id}><h4>{program.program_name}</h4><p>{program.agency_label}</p>{program.max_amount_str&&<strong>{program.max_amount_str}</strong>}{safeSource(program.url || program.compass_url)&&<p><a href={safeSource(program.url || program.compass_url)} target="_blank" rel="noreferrer">Program details ↗</a></p>}</article>)}</div>:<p>No fund or program listings recorded for this organization.</p>}
  <OrganizationFunds organization={active.organization} refresh={0} />
  {(active.fundingFacts?.records.length || 0)>0&&<details className="money-observations"><summary>Recorded funding facts ({active.fundingFacts!.records.length})</summary><p className="muted">Appropriations, expenditures and individual awards retain their own scope and period. These observations are not added together.</p><div className="support-table-scroll"><table className="finance-table"><thead><tr><th>Record</th><th>Classification</th><th>Fiscal year</th><th>Amount</th><th>Evidence</th></tr></thead><tbody>{[...active.fundingFacts!.records].sort((a,b)=>(b.fiscal_year || 0)-(a.fiscal_year || 0)).map(fact=><tr key={fact.id}><td>{active.records.find(record=>record.record_id===fact.support_record_id)?.description || fact.scope}</td><td>{fact.fact_type.replaceAll('_',' ')}</td><td>{fact.fiscal_year?`FY${fact.fiscal_year}`:'Not specified'}</td><td>{fact.amount===null?'Undisclosed':money(fact.amount,fact.currency || 'Unspecified currency')}</td><td>{safeSource(fact.source_url)&&<a href={safeSource(fact.source_url)} target="_blank" rel="noreferrer">Source ↗</a>}</td></tr>)}</tbody></table></div></details>}
  {(active.fundingFacts?.nextOffset!==null&&active.fundingFacts?.nextOffset!==undefined||active.fundingPrograms?.nextOffset!==null&&active.fundingPrograms?.nextOffset!==undefined)&&<p className="muted">Additional funding evidence exists beyond the displayed page. Monetary totals and recipient rankings use the full report.</p>}
 </section>
}
