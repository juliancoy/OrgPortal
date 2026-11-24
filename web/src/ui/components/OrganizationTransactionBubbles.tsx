import {useEffect,useState,type CSSProperties} from 'react'
import {ecosystemUrl} from '../../features/ecosystem/ecosystemApi'
import {readEvidenceResponse} from '../../features/ecosystem/readEvidenceResponse.js'
import {financialEvidence} from '../../features/ecosystem/financial-evidence.js'
import {useGroupingMembers} from './OrganizationGrouping'
import type {MapNode,MapPage} from '../../features/ecosystem/organizationMap'

type Transaction={id:string;transactionRecordId?:string;source:string;target:string;sourceLabel?:string;targetLabel?:string;kind:string;amount?:number|null;currency?:string|null;amountLabel?:string;date?:string;periodStart?:string;periodEnd?:string;fiscalYear?:number;sourceUrl?:string;sourceSystem?:string;sourceDataset?:string;description?:string;notes?:string;financialFactType?:string;financialMeasure?:string;status?:string;grantStatus?:string;type?:string;evidence?:string}
type Page={version:string;records:Transaction[];total:number;nextOffset:number|null;financialMembers?:string[];members?:{id:string}[]}
// Only public evidence, bounded to 32 pages. Keys include snapshot, year, node,
// grouping and offset; returning to a hovered node reuses its completed page.
const pages=new Map<string,Page>()
const safeSource=(value?:string)=>{try{const url=new URL(value||'');return ['https:','http:'].includes(url.protocol)?url.href:undefined}catch{return undefined}}
const labels:Record<string,string>={revenue:'Annual revenue · not an individual payment',expense:'Annual expense · not an individual payment',disbursement:'Recorded payment',reported_award:'Award / approval · not a payment',obligation:'Obligation · not a payment',appropriation:'Appropriation · not a payment',program_ceiling:'Program ceiling · not a payment',balance:'Balance observation',rescission:'Rescission',administration:'Administrative record'}
const money=(row:Transaction)=>Number.isFinite(row.amount)?`${row.currency||(/^\$/.test(row.amountLabel||'')?'USD':'Currency unavailable')} ${row.amount!.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`:'Amount unavailable'

export function OrganizationTransactionBubbles({node,data}:{node:MapNode;data:MapPage}){
 const members=useGroupingMembers(node.slug||node.id),[offset,setOffset]=useState(0),[attempt,setAttempt]=useState(0)
 useEffect(()=>setOffset(0),[members])
 const url=ecosystemUrl('organization-evidence',{org:node.id,members,fy:data.fy,version:data.version,sort:'amount-desc',offset,limit:20})
 const [result,setResult]=useState<{url:string;page:Page}|null>(null),[failure,setFailure]=useState<{url:string;message:string}|null>(null)
 useEffect(()=>{
  if(pages.has(url)){setResult({url,page:pages.get(url)!});return}
  const abort=new AbortController()
  const timer=setTimeout(()=>{
   void fetch(url,{signal:abort.signal,credentials:'omit'}).then(readEvidenceResponse<Page>).then(page=>{
    if(page.version!==data.version||!Array.isArray(page.records))throw Error('The evidence snapshot changed. Refresh the map.')
    if(abort.signal.aborted)return
    pages.set(url,page);if(pages.size>32)pages.delete(pages.keys().next().value!)
    setResult({url,page});setFailure(null)
   }).catch(error=>{if(!abort.signal.aborted)setFailure({url,message:error.message})})
  },180)
  return()=>{clearTimeout(timer);abort.abort()}
 },[url,data.version,attempt])
 const page=result?.url===url?result.page:pages.get(url),error=failure?.url===url?failure.message:null
 const scope=new Set(page?.financialMembers||page?.members?.map(member=>member.id)||[node.id])
 return <section className="organization-transaction-bubbles" aria-label="Individual recorded transactions">
  <h4>Recorded transactions</h4>
  <p className="muted">Largest first within each currency · USD first. Annual statement observations are separate from payments.</p>
  {error?<p role="alert">Transactions unavailable: {error} <button type="button" onClick={()=>{setFailure(null);setAttempt(n=>n+1)}}>Retry transactions</button></p>:!page?<p role="status">Loading transactions…</p>:<>
   <p role="status">{page.total?`${offset+1}–${offset+page.records.length} of ${page.total.toLocaleString()} records`:'No financial transactions recorded for this year.'}</p>
   <ol start={offset+1}>{page.records.map(row=>{
    const incoming=scope.has(row.target),outgoing=scope.has(row.source),internal=incoming&&outgoing
    const fact=financialEvidence(row)||(['approval','obligation','appropriation'].includes(row.kind)?row.kind==='approval'?'reported_award':row.kind:'')
    const source=safeSource(row.sourceUrl),width=128+Math.min(110,Math.log10(1+Math.abs(row.amount||0))*12)
    return <li key={row.transactionRecordId||row.id}>
     <article className="organization-transaction-bubble" data-direction={internal?'internal':incoming?'received':'disbursed'} data-record-id={row.id} style={{'--transaction-width':`${width}px`} as CSSProperties}>
      <span>{fact==='revenue'?'Annual revenue':fact==='expense'?'Annual expense':internal?'Internal transfer':incoming?'Incoming':'Outgoing'}{Number.isFinite(row.amount)&&row.amount!<0?' · adjustment':''}</span>
      <strong>{money(row)}</strong>
      <span>{internal?`${row.sourceLabel||row.source} → ${row.targetLabel||row.target}`:incoming?`From ${row.sourceLabel||row.source}`:`To ${row.targetLabel||row.target}`}</span>
      <time>{row.periodStart&&row.periodEnd?`${row.periodStart} – ${row.periodEnd}`:row.date||(row.fiscalYear?`FY${row.fiscalYear}`:'Date unavailable')}</time>
     </article>
     <div className="organization-transaction-evidence"><span>{labels[fact]||'Recorded transfer'}</span>
      <details><summary>Record details</summary>
       <p>{row.sourceLabel||row.source} → {row.targetLabel||row.target}</p>
       <p>{row.description||row.type||'No description supplied.'}</p>{row.notes&&<p>{row.notes}</p>}
       <p>{row.sourceSystem?.replaceAll('_',' ')}{row.sourceDataset?` · ${row.sourceDataset}`:''}</p>
       <p>Record: {row.transactionRecordId||row.id}</p>
       {internal&&<p>Internal to this grouping; excluded from received and disbursed totals.</p>}
      </details>
      {source&&<a href={source} target="_blank" rel="noreferrer">Source evidence ↗</a>}
     </div>
    </li>
   })}</ol>
   <div className="organization-transaction-pagination"><button type="button" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>Previous</button><button type="button" disabled={page.nextOffset===null} onClick={()=>setOffset(page.nextOffset!)}>Next records</button></div>
  </>}
 </section>
}
