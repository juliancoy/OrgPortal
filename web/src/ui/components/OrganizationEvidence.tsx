import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useEcosystemQuery, type QueryMeta } from '../../features/ecosystem/ecosystemApi'
import './organization-evidence.css'
import {OrganizationAnnualStatements} from './OrganizationAnnualStatements'
import {useGroupingMembers} from './OrganizationGrouping'
import {OrganizationFinancialTotals,type FinancialTotals} from './OrganizationFinancialTotals'
import {useOrganizationYear} from '../../features/ecosystem/organizationYear'
import {organizationEvidenceKinds as labels,organizationEvidenceLabel} from './organizationEvidenceLabel'

type RelatedOrganization = {id:string; name:string; slug:string|null; classification:string; recordCount:number; sourceUrl?:string}
type Evidence = {id:string; sourceLabel:string; targetLabel:string; kind:string; financialFactType?:string; financialMeasure?:string; measurement?:string; status?:string; grantStatus?:string; type?:string; evidence?:string; amount:number|null; currency:string|null; amountLabel?:string; date?:string; fiscalYear?:number; sourceUrl?:string; description?:string; notes?:string; sourceSystem?:string; sourceDataset?:string; agencyAttachment?:{method:string}; sourceAgency?:{label:string;code:string}}
type Report = QueryMeta & {organization:RelatedOrganization|null; financialTotals?:FinancialTotals; financialMembers?:string[]; parents:RelatedOrganization[]; children:RelatedOrganization[]; groups:{kind:string;count:number}[]; records:Evidence[]; total:number; offset:number; nextOffset:number|null}
const safeSourceUrl=(value?:string)=>{try{const url=new URL(value||'');return ['http:','https:'].includes(url.protocol)?url.href:undefined}catch{return undefined}}
const classificationLabels:Record<string,string> = {department:'Departments',agency:'Agencies, offices and branches',budget_heading:'Budget headings',organization:'Related organizations'}
function EvidenceRecords({handle,members}:{handle:string;members?:string}) {
 const {fy}=useOrganizationYear()
 const [offset,setOffset]=useState(0),[kind,setKind]=useState('')
 const {data,error}=useEcosystemQuery<Report>('organization-evidence',{org:handle,members,fy,offset,kind,limit:25})
 if(error)return <p role="alert">Unable to load organization evidence: {error} <button onClick={()=>window.location.reload()}>Reload</button></p>
 if(!data)return <p role="status">Loading organization evidence…</p>
 if(!data.organization)return null
 const counts=new Map<string,number>();for(const group of data.groups)counts.set(group.kind,(counts.get(group.kind)||0)+group.count)
 return <section className="organization-evidence-records" aria-label={`Evidence for ${data.organization.name}`}>
  <h3>Evidence for {data.organization.name}</h3>
  <p>{data.financialMembers?.length?`These records cover the ${data.financialMembers.length.toLocaleString()} organizations in this rollup; original sources and recipients are preserved.`:'These records concern this organization.'} Annual statements, approvals, payments and appropriations are separate observations, not amounts to add together.</p>
  <label>Evidence type <select value={kind} onChange={event=>{setKind(event.target.value);setOffset(0)}}><option value="">All evidence ({data.organization.recordCount.toLocaleString()})</option>{[...counts].map(([value,count])=><option key={value} value={value}>{labels[value]||value} ({count.toLocaleString()})</option>)}</select></label>
  <p role="status">{data.total?`${offset+1}–${Math.min(offset+data.records.length,data.total)} of ${data.total.toLocaleString()} records`:'No records in this snapshot.'}</p>
  <ol className="organization-evidence-list" start={offset+1}>{data.records.map(row=><li key={row.id}>
   <strong>{row.sourceLabel || 'Unspecified source'} → {row.targetLabel || 'Unspecified recipient'}</strong>
   <p>{organizationEvidenceLabel(row)} · {row.date || (row.fiscalYear?`FY${row.fiscalYear}`:'Date not supplied')}{row.amount!==null&&Number.isFinite(row.amount)?` · ${row.amount.toLocaleString(undefined,{maximumFractionDigits:2})} ${row.currency||''}`:''}{row.amountLabel?` · ${row.amountLabel}`:''}</p>
   {row.sourceSystem&&<p>{row.sourceSystem.replaceAll('_',' ')}{row.sourceDataset?` · ${row.sourceDataset.toUpperCase()}`:''}{row.sourceAgency?` · Source agency code ${row.sourceAgency.code}`:''}</p>}
   {safeSourceUrl(row.sourceUrl)&&<a href={safeSourceUrl(row.sourceUrl)} target="_blank" rel="noreferrer">Source evidence</a>}
   {(row.description||row.notes)&&<details><summary>Record details</summary><p>{row.description}</p>{row.notes&&<p>{row.notes}</p>}</details>}
  </li>)}</ol>
  <div className="organization-evidence-actions"><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-25))}>Previous records</button><button disabled={data.nextOffset===null} onClick={()=>setOffset(data.nextOffset!)}>Next records</button></div>
 </section>
}
export function OrganizationEvidence({slug}:{slug:string}) {
 const {fy}=useOrganizationYear()
 const members=useGroupingMembers(slug)
 const {data,error}=useEcosystemQuery<Report>('organization-evidence',{org:slug,members,fy,limit:1})
 const [selected,setSelected]=useState<string|null>(null),[showRecords,setShowRecords]=useState(false)
 const recordsRef=useRef<HTMLDivElement>(null)
 useEffect(()=>{if(showRecords){recordsRef.current?.scrollIntoView({block:'start'});recordsRef.current?.focus({preventScroll:true})}},[selected,showRecords])
 if(error)return <section className="organization-evidence"><p role="status">Organization relationships and evidence are unavailable: {error} <button onClick={()=>window.location.reload()}>Reload</button></p></section>
 if(!data)return <p role="status">Loading organization relationships…</p>
 if(!data.organization)return null
 const groups=new Map<string,RelatedOrganization[]>();for(const child of data.children){const key=child.classification||'organization';groups.set(key,[...(groups.get(key)||[]),child])}
 const current=selected?data.children.find(child=>child.id===selected):data.organization
 return <section className="organization-evidence" aria-label="Organization relationships and evidence">
  <OrganizationFinancialTotals totals={data.financialTotals} fy={fy} organizationCount={data.financialMembers?.length}/>
  <OrganizationAnnualStatements organizationId={data.organization.id} fy={fy}/>
  {!!data.parents.length&&<><h2>Listed under</h2><ul>{data.parents.map(parent=><li key={parent.id}>{parent.slug?<Link to={`/orgs/${encodeURIComponent(parent.slug)}?${new URLSearchParams({fy})}`}>{parent.name}</Link>:parent.name}{safeSourceUrl(parent.sourceUrl)&&<> · <a href={safeSourceUrl(parent.sourceUrl)} target="_blank" rel="noreferrer">Relationship source</a></>}</li>)}</ul></>}
  {!!data.children.length&&<><h2>{groups.has('department')?'Departments and agencies':'Related organizations'}</h2><p>All {data.children.length} documented entries. This listing includes independent offices and budget headings; it does not imply that every entry reports to the same executive.</p>
   {[...groups].sort(([a],[b])=>['department','agency','organization','budget_heading'].indexOf(a)-['department','agency','organization','budget_heading'].indexOf(b)).map(([classification,members])=><details key={classification} open={classification==='department'}><summary>{classificationLabels[classification]||classification} ({members.length})</summary><ul className="organization-evidence-members">{members.map(member=><li key={member.id}><span>{member.slug?<Link to={`/orgs/${encodeURIComponent(member.slug)}?${new URLSearchParams({fy})}`}>{member.name}</Link>:member.name}</span><button onClick={()=>{setSelected(member.id);setShowRecords(true)}} aria-label={`View evidence for ${member.name}`}>View evidence{fy==='all'?` (${member.recordCount.toLocaleString()})`:` · ${fy==='unassigned'?'Year unavailable':'FY'+fy}`}</button></li>)}</ul></details>)}
  </>}
  <div className="organization-evidence-actions"><button onClick={()=>{setSelected(null);setShowRecords(true)}}>View {data.organization.name} evidence ({data.organization.recordCount.toLocaleString()})</button>{showRecords&&<button onClick={()=>setShowRecords(false)}>Hide records</button>}</div>
  {showRecords&&current&&<div ref={recordsRef} tabIndex={-1} className="organization-evidence-selection"><EvidenceRecords key={current.id+(members||'')+fy} handle={current.id} members={selected?undefined:members}/><button onClick={()=>setShowRecords(false)}>Hide records</button></div>}
  <p className="muted">Evidence snapshot: {new Date(data.generatedAt).toLocaleString()}. Source labels without reviewed identity links remain separate.</p>
 </section>
}
