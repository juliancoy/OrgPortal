import {observationTitle,observationAmount} from '../../features/ecosystem/node-financial-observations.js'
import {useEffect,useMemo,useRef} from 'react'
import type {MapNode,MapPage} from '../../features/ecosystem/organizationMap'
import {OrganizationAnnualStatements} from './OrganizationAnnualStatements'
import {OrganizationTransactionBubbles} from './OrganizationTransactionBubbles'

const dollars=(amount:number|null|undefined)=>typeof amount==='number'&&Number.isFinite(amount)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(amount):'Unavailable'

export function OrganizationMapInspector({data,node,hovered,onClear,onPin,onMinimize}:{data:MapPage;node?:MapNode;hovered:boolean;onClear:()=>void;onPin:()=>void;onMinimize:()=>void}){
 const panel=useRef<HTMLElement>(null)
 const anchorName=data.organizations.find(org=>org.id===data.anchor)?.name||'selected organization'
 useEffect(()=>{if(panel.current)panel.current.scrollTop=0},[node?.id,data.fy])
 const connections=useMemo(()=>{
  const parents=new Set<string>(),children=new Set<string>();let records=0
  for(const edge of data.relationships){
   if(edge.target===node?.id)parents.add(edge.source)
   if(edge.source===node?.id)children.add(edge.target)
   if(!edge.hierarchy&&(edge.source===node?.id||edge.target===node?.id))records+=edge.recordCount
  }
  return {parents:parents.size,children:children.size,records}
 },[data,node?.id])
 return <aside ref={panel} className="organization-map-inspector" aria-label="Node inspector">
  <div className="organization-map-inspector-toolbar">
  <header><strong>Node details</strong><button type="button" onClick={onMinimize} aria-label="Minimize node inspector" title="Minimize to the right">›</button></header>
   {node&&<div className="organization-map-inspector-actions"><span>{hovered?'Hovered node':'Selected node'}</span>{hovered?<button type="button" onClick={onPin}>Keep details</button>:<button type="button" onClick={onClear} aria-label="Close selected node details">×</button>}</div>}
  </div>
  {node?<>
   <h3>{node.name}</h3>
   <p>{node.category.replaceAll('-',' ')}{node.type?` · ${node.type}`:''}</p>
   <p className="muted">{data.fy&&/^\d{4}$/.test(data.fy)?`FY${data.fy}`:data.fy==='unassigned'?'Year unavailable':'All years'}</p>
   {node.relationshipCash&&<section aria-label="Payments with selected organization">
    <h4>Payments with {anchorName}</h4>
    <dl className="organization-map-inspector-totals">
     <div><dt>Paid to {anchorName} (USD)</dt><dd>{dollars(node.relationshipCash.disbursedUsd)}</dd></div>
     <div><dt>Received from {anchorName} (USD)</dt><dd>{dollars(node.relationshipCash.receivedUsd)}</dd></div>
    </dl>
    {!!node.relationshipCash.missingAmounts&&<p>{node.relationshipCash.missingAmounts} records with unavailable amounts or currency excluded.</p>}
   </section>}
   <h4>Organization-wide totals</h4>
   <dl className="organization-map-inspector-totals">
    <div><dt>Recorded cash received (USD)</dt><dd>{dollars(node.receivedUsd)}</dd></div>
    <div><dt>Recorded cash disbursed (USD)</dt><dd>{dollars(node.disbursedUsd)}</dd></div>
   </dl>
   {!!node.financialObservations?.length&&<section aria-label="Other recorded amounts"><p>Other recorded amounts (USD). ↓ incoming · ↑ outgoing. Types and periods are separate; do not add them to cash totals.</p><dl className="organization-map-inspector-totals">{node.financialObservations.map((row,index)=><div key={index}><dt>{observationTitle(row)}</dt><dd>{observationAmount(row,value=>dollars(value))}</dd>{!!row.missingAmounts&&<dd>{row.missingAmounts} records with unavailable amounts excluded</dd>}</div>)}</dl></section>}
   <OrganizationTransactionBubbles key={JSON.stringify([node.id,data.fy,data.version])} node={node} data={data}/>
   <OrganizationAnnualStatements key={node.id} organizationId={node.id} fy={data.fy}/>
   <details><summary>Connections and source identity</summary><dl>
    <div><dt>Recorded USD volume</dt><dd>{dollars(node.financialAmount)}</dd></div>
    <div><dt>Upstream nodes in this view</dt><dd>{connections.parents.toLocaleString()}</dd></div>
    <div><dt>Downstream nodes in this view</dt><dd>{connections.children.toLocaleString()}</dd></div>
    <div><dt>Linked records in this view</dt><dd>{connections.records.toLocaleString()}</dd></div>
   </dl>
   <p className="muted">Received amounts are recorded transfers, not budgets or awards. Missing amounts are unavailable. Connection counts cover the loaded view.</p>
   <p>{node.id}</p><p>Snapshot: {data.generatedAt}</p></details>
  </>:<p>Hover a node to inspect it, or select a node in the map.</p>}
 </aside>
}
