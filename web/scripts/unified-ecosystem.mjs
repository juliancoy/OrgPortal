// A public, database-backed graph projection shared by every dimensional renderer.
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value!==null&&typeof value==='object'?`{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')}}`:JSON.stringify(value);
const collections=['organizations','relationships','financing','events','nonprofitProfiles','performanceRecords','performanceAssessments','metadata','positions'];
export function projectNativeEvidence(input,records,directory=[]){
 const data=structuredClone(input),orgs=new Map(data.organizations.map(o=>[o.id,o]));
 const slugs=new Map(),aliases=new Map()
 for(const org of data.organizations)if(org.portalSlug){const candidates=slugs.get(org.portalSlug)||[];candidates.push(org.id);slugs.set(org.portalSlug,candidates)}
 for(const org of directory){
  const candidates=slugs.get(org.slug)||[],id=orgs.has(org.id)?org.id:candidates.length===1?candidates[0]:org.id
  aliases.set(org.id,id)
  if(orgs.has(id))orgs.set(id,{...orgs.get(id),name:org.name,portalSlug:org.slug});
  if(!orgs.has(id))orgs.set(id,{id,name:org.name,type:'Organization',category:'general',website:org.source_url||'',relevance:org.description||'',portalSlug:org.slug,directory:true,sourceCategory:'OrgPortal'})
 }
 const bySource=new Map();for(const edge of data.relationships){bySource.set(edge.id,edge);if(edge.financingId)bySource.set(edge.financingId,edge);if(edge.id.startsWith('portal:'))bySource.set(edge.id.slice(7),edge);}
 const replaced=new Set(),newEdges=[];
 function endpoint(id,label,scope,role,prior){
  if(id&&aliases.has(id))return aliases.get(id);
  if(id&&orgs.has(id))return id;
  if(!id&&!label)return null;
  const nodeId=id||`source-label:${scope}:${role}:${hash(label).slice(0,32)}`;
  if(!orgs.has(nodeId))orgs.set(nodeId,{id:nodeId,name:label||id,type:id?'Organization':'Source label',category:role==='agency'?'government':'general',entityType:id?'organization':'source_label',identityStatus:id?'source_linked':'unverified_label',directory:false,sourceCategory:scope,relevance:id?'Organization linked by the transactional source record.':'Source-reported counterparty label; not a verified organization identity. May name multiple recipients.'});
  return nodeId;
 }
 // Preserve unresolved snapshot counterparties as source-label groups too.
 for(const edge of data.relationships){
  const scope=edge.id.startsWith('irs990:')?'irs990':edge.awardKey?.startsWith('usaspending:')?'usaspending':'ecosystem_source'
  if(!edge.source)edge.source=endpoint(null,edge.sourceLabel,scope,'agency',null)
  if(!edge.target)edge.target=endpoint(null,edge.targetLabel,scope,'recipient',null)
 }
 for(const r of records){
  const originalId=r.record_id?.replace(/^bmoremedtech:/,''),previous=bySource.get(r.record_id)||bySource.get(originalId);
  if(previous)replaced.add(previous.id);
  const comptroller=r.record_type==='external_financial_observation',bpw=comptroller&&r.id.startsWith('md-bpw:');
  const scope=comptroller?'maryland_comptroller':r.record_type;
  const kind=bpw?'approval':comptroller?'transfer':r.transaction_type;
  const source=endpoint(r.from_organization_id,r.from_label,scope,'agency',previous?.source),target=endpoint(r.to_organization_id,r.to_label,scope,'recipient',previous?.target);
  const financialMeasure=bpw?'reported_approval':comptroller?'reported_disbursement':r.record_type==='nonprofit_grant'?'reported_nonprofit_grant':r.financial_measurement;
  let provenance={};try{provenance=JSON.parse(r.provenance_json||'{}')}catch{/* Retain the unparsed original record below. */}
  const edge={...previous,id:previous?.id||r.id,source,target,sourceLabel:r.from_label||'',targetLabel:r.to_label||'',kind,
   relationship:['transfer','grant','contract','donation','approval','equity','debt','agency'].includes(kind)?'funding':kind,
   amount:r.amount,currency:r.currency,amountLabel:r.amount_label||'',date:r.occurred_at||'',type:r.description||kind,description:r.description||'',
   sourceUrl:r.source_url,evidence:r.evidence,notes:r.notes,status:r.status,financialMeasure,financialFactType:r.financial_fact_type,
   measurement:r.financial_measurement,periodStart:r.period_start,periodEnd:r.period_end,quantity:r.quantity,unit:r.unit,
   provenance,transactionRecordId:r.id,sourceRecordType:r.record_type};
  newEdges.push(edge);
 }
 data.relationships=[...data.relationships.filter(r=>!replaced.has(r.id)),...newEdges];
 const referenced=new Set(data.relationships.flatMap(r=>[r.source,r.target]));
 data.organizations=[...orgs.values()].filter(o=>o.entityType!=='source_label'||referenced.has(o.id));
 // financing is a secondary presentation of the same evidence, never extra graph edges.
 const nativeById=new Map(newEdges.map(r=>[r.id,r]));
 data.financing=(data.financing||[]).map(r=>{const match=nativeById.get(r.id)||newEdges.find(e=>e.financingId===r.id);return match?{...r,...match,funderId:match.source,recipientId:match.target,funder:match.sourceLabel,recipient:match.targetLabel}:r;});
 data.transactionalCoverage={directoryRecords:directory.length,nativeRecords:records.length,comptrollerRecords:records.filter(r=>r.record_type==='external_financial_observation').length,unverifiedLabelNodes:data.organizations.filter(o=>o.identityStatus==='unverified_label').length};
 return data;
}
export async function exportUnifiedEcosystem({fetcher=fetch,base='https://lifetech.fyi/api/org/api/network/ecosystem/public'}={}){
 let datasetId;const all=[],data={organizations:[],relationships:[],financing:[],events:[],nonprofitProfiles:[]},performance={records:[],assessments:[]},positions={organizations:{}};
 const get=async(url)=>{const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error(`Unified database export failed (${response.status})`);return response.json();};
 for(const collection of collections){let after='';do{
  const url=new URL(base+'/'+collection);if(after)url.searchParams.set('after',after);if(datasetId)url.searchParams.set('datasetId',datasetId);
  const page=await get(url);if(!/^[a-f0-9]{64}$/.test(page.datasetId)||datasetId&&page.datasetId!==datasetId||!Array.isArray(page.records))throw Error('Inconsistent database snapshot');datasetId=page.datasetId;
  for(const r of page.records){if(hash(canonical(r.value))!==r.sha256)throw Error('Database source checksum mismatch');all.push({collection,...r});const v=r.value;
   if(collection==='metadata'){if(v.id.startsWith('data:'))data[v.id.slice(5)]=v.value;else if(v.id.startsWith('performance:'))performance[v.id.slice(12)]=v.value;else if(v.id.startsWith('positions:'))positions[v.id.slice(10)]=v.value;}
   else if(collection==='positions')positions.organizations[v.id]=v.value;
   else if(collection==='performanceRecords')performance.records.push(v);
   else if(collection==='performanceAssessments')performance.assessments.push(v);
   else data[collection].push(v);
  }
  if(page.next!==null&&(typeof page.next!=='string'||page.next<=after))throw Error('Invalid source cursor');after=page.next;
 }while(after!==null);}
 all.sort((a,b)=>(a.collection+'\t'+a.key)<(b.collection+'\t'+b.key)?-1:1);
 if(hash(all.map(r=>`${r.collection}\t${r.key}\t${r.sha256}\n`).join(''))!==datasetId)throw Error('Database dataset digest mismatch');
 const native=[];let after='';do{const url=new URL(base+'/native');if(after)url.searchParams.set('after',after);const page=await get(url);if(!Array.isArray(page.records)||page.next!==null&&(typeof page.next!=='string'||page.next<=after))throw Error('Invalid native evidence page');native.push(...page.records);after=page.next;}while(after!==null);
 const directory=[]
 for(let offset=0;;offset+=500){const page=await get(new URL(base.replace(/\/ecosystem\/public$/,'')+'/orgs/public?limit=500&offset='+offset));if(!Array.isArray(page))throw Error('Incomplete public organization directory');directory.push(...page);if(page.length<500)break;}
 return {datasetId,exportedAt:new Date().toISOString(),data:projectNativeEvidence(data,native,directory),performance,positions};
}
