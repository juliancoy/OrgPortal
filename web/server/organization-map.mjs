import {organizationGroup} from './organization-group.mjs'
import {organizationEvidenceYear} from './organization-evidence-year.mjs'
import {organizationFinancialTotals} from './organization-financial-totals.mjs'
import {fiscalMatches} from '../src/features/ecosystem/transaction-time.js'
// Keep only compact public neighborhoods, scoped to the artifact reader and
// snapshot. The raw topology + search indexes exceed the artifact cache budget;
// rereading them for every 250-node page caused repeated parsing and GC.
const readers=new WeakMap(),maxBytes=16*1024*1024,maxEntries=12
const projectOrganization=(org,amount)=>({id:org.id,name:org.name,slug:org.portalSlug||null,category:org.category||'general',type:org.type||'',financialAmount:Number.isFinite(amount)&&amount>=0?amount:null})
async function hiddenYearParent(read,readRows,manifest,params){
 const allYears=new URLSearchParams(params);allYears.set('fy','all')
 const map=await neighborhood(read,readRows,manifest,allYears)
 let best=null
 // Only incoming candidates need detail reads, never the outgoing neighborhood.
 // Batch them so a large source list does not become one unbounded response.
 const score=node=>Number.isFinite(node?.networkMetrics?.amount)&&node.networkMetrics.amount>=0?node.networkMetrics.amount:-1
 for(let offset=0;offset<(map.parentPositions?.length||0);offset+=100){
  for(const org of await readRows(read,manifest.version,'organizations',map.parentPositions.slice(offset,offset+100))){
   if(!best||score(org)>score(best)||score(org)===score(best)&&org.id.localeCompare(best.id)<0)best=org
  }
 }
 return best?projectOrganization(best,best.networkMetrics?.amount):null
}
async function neighborhood(read,readRows,manifest,params){
 let cache=readers.get(read)
 if(!cache||cache.version!==manifest.version){cache={version:manifest.version,entries:new Map(),pending:new Map(),bytes:0};readers.set(read,cache)}
 const key=JSON.stringify([params.get('org'),params.get('members'),params.get('fy')||'all'])
 if(cache.entries.has(key)){const item=cache.entries.get(key);cache.entries.delete(key);cache.entries.set(key,item);return item.value}
 if(cache.pending.has(key))return cache.pending.get(key)
 const request=buildNeighborhood(read,readRows,manifest,params).then(value=>{
  const bytes=new TextEncoder().encode(JSON.stringify(value)).byteLength*3
  if(bytes<=maxBytes){cache.entries.set(key,{value,bytes});cache.bytes+=bytes
   while(cache.bytes>maxBytes||cache.entries.size>maxEntries){const first=cache.entries.keys().next().value;cache.bytes-=cache.entries.get(first).bytes;cache.entries.delete(first)}}
  return value
 })
 cache.pending.set(key,request);try{return await request}finally{cache.pending.delete(key)}
}
// A complete, direct neighborhood, compacted by ordered pair without summing money.
export async function organizationMap(read, readRows, manifest, params, meta) {
 const handle=params.get('org')
 if(!handle||handle.length>300)throw Error('Invalid organization reference')
 const integer=(key,fallback,max)=>{const value=params.get(key);if(value===null)return fallback;if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>max)throw Error(`Invalid ${key}`);return Number(value)}
 const offset=integer('offset',0,1e7),limit=integer('limit',200,250);if(!limit)throw Error('Invalid limit')
 const map=await neighborhood(read,readRows,manifest,params)
 const selected=map.positions.slice(offset,offset+limit)
 if(map.anchor)selected.push(map.anchor.position)
 // Keep detail reads paginated even in runtimes with request-scoped readers.
 // A small request must not fetch every organization's full evidence metrics.
 const fy=params.get('fy'),metrics=new Map()
 if(fy&&fy!=='all'&&(fy==='unassigned'||manifest.fiscalYears?.map(String).includes(fy)))await Promise.all([...new Set(selected.map(i=>Math.floor(i/100)))].map(async shard=>metrics.set(shard,await read(`${manifest.version}/fiscal/${fy}/metrics/${shard}.json`))))
 const organizations=(await readRows(read,manifest.version,'organizations',selected)).map((org,i)=>{
  const amount=fy&&fy!=='all'?metrics.get(Math.floor(selected[i]/100))?.[selected[i]%100]?.amount:org.networkMetrics?.amount
  return projectOrganization(org,amount)
 })
 // A displayed group has one cash volume, including its attached source nodes.
 if(params.has('members')&&map.financialTotals){const anchor=organizations.find(org=>org.id===map.anchor?.id),usd=map.financialTotals.currencies.find(total=>total.currency==='USD');if(anchor)anchor.financialAmount=usd?Math.max(0,usd.received+usd.disbursed):0}
 // Navigation may escape an empty year without putting off-year relationships
 // or money into the year-filtered map itself.
 const hiddenParent=map.anchor&&fy&&fy!=='all'&&!map.incoming?await hiddenYearParent(read,readRows,manifest,params):null
 const visible=new Set(organizations.map(org=>org.id))
 return {body:{...meta,anchor:map.anchor?.id||null,hiddenParent,financialTotals:map.financialTotals,organizations,relationships:map.relationships.filter(edge=>visible.has(edge.source)&&visible.has(edge.target)),total:map.positions.length,incoming:map.incoming,outgoing:map.outgoing,offset,nextOffset:offset+limit<map.positions.length?offset+limit:null}}
}
async function buildNeighborhood(read,readRows,manifest,params){
 const version=manifest.version
 const profile=await organizationGroup(read,readRows,manifest,params)
 if(!profile)return {anchor:null,positions:[],relationships:[],incoming:0,outgoing:0}
 const selected=profile.organization.id,topology=await read(`${version}/topology.json`),index=await read(`${version}/organizations/index.json`)
 const members=new Set(profile.members.map(member=>member.id))
 const nodeId=value=>typeof value==='number'?topology.nodeIds[value]:value
 const neighbors=new Set(),incoming=new Set(),outgoing=new Set(),pairs=new Map()
 const add=(from,to,kind,hierarchy=false)=>{
  const source=members.has(from)?selected:from,target=members.has(to)?selected:to
  if(source===target||source!==selected&&target!==selected)return
  const neighbor=source===selected?target:source;neighbors.add(neighbor)
  if(source===selected)outgoing.add(neighbor);else incoming.add(neighbor)
  const key=JSON.stringify(hierarchy?[source,target,'hierarchy']:[source,target]),pair=pairs.get(key)||{id:key,source,target,recordCount:0,kinds:[],...(hierarchy?{hierarchy:true}:{})}
  if(!hierarchy)pair.recordCount++;if(!pair.kinds.includes(kind))pair.kinds.push(kind);pairs.set(key,pair)
 }
 // Undated organizational membership still exists in a year-filtered view.
 // Keep it separate from actual payments, including when endpoints coincide.
 const structural=new Set()
 for(const child of profile.children||[]){add(selected,child.id,'agency',true);structural.add(JSON.stringify([selected,child.id]))}
 for(const parent of profile.parents||[]){add(parent.id,selected,'agency',true);structural.add(JSON.stringify([parent.id,selected]))}
 const fy=params.get('fy')
 // Reuse the evidence projection, including consolidated members and signed
 // adjustments. Cache the summary with the neighborhood, never sum map edges.
 const financialProfile=profile.recordKinds?await organizationEvidenceYear(read,readRows,manifest,profile,fy):null
 const financialTotals=financialProfile?await organizationFinancialTotals(read,readRows,manifest,financialProfile,fy):undefined
 for(const edgeIndex of new Set([...members].flatMap(id=>topology.edgesByOrg[id]||[]))){const edge=topology.edges[edgeIndex],from=nodeId(edge[0]),to=nodeId(edge[1]);if(edge[2]==='agency'&&structural.has(JSON.stringify([members.has(from)?selected:from,members.has(to)?selected:to])))continue;if(fiscalMatches(edge[4],fy))add(from,to,edge[2])}
 // Program offerings are nonfinancial relationships, even though the network's
 // financial topology excludes them. They belong in the organization neighborhood.
 for(const row of await readRows(read,version,'relationships',profile.recordKinds?.terms||[]))if(row.status!=='voided'&&fiscalMatches(row,fy))add(row.source,row.target,'terms')
 const ids=[...neighbors].sort();ids.push(selected)
 const positions=new Map(index.rows.map((row,i)=>[row.id,i]))
 if(ids.some(id=>!positions.has(id)))throw Error('Organization map contains an unresolved endpoint')
 ids.pop()
 return {anchor:{id:selected,position:positions.get(selected)},financialTotals,positions:ids.map(id=>positions.get(id)),parentPositions:[...incoming].sort().map(id=>positions.get(id)),relationships:[...pairs.values()],incoming:incoming.size,outgoing:outgoing.size}
}
