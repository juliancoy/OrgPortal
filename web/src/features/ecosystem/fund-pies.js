import { key, safeUrl } from './ecosystem.js'

// Fund administration is sourced metadata, not a merger of legal entities or records.
export const managedFunds = [
 {name:'TEDCO Equitech Growth Fund', administrator:'TEDCO', sourceUrl:'https://www.tedcomd.com/press-release/tedcos-first-round-equitech-growth-fund-awardees-unveiled'},
 {name:'TEDCO Life Science Investment Fund', administrator:'TEDCO', umbrella:'Seed Funds', sourceUrl:'https://www.tedcomd.com/press-release/tedco-invests-irazu-oncology'},
 {name:'TEDCO Seed Funds / SSBCI', administrator:'TEDCO', sourceUrl:'https://www.tedcomd.com/insight/tedco-announces-state-small-business-credit-initiative-investment-irazu-oncology'},
]
export function applyFundHierarchy(data) {
 const names=new Map()
 for(const org of data.organizations){const name=key(org.name);if(!names.has(name))names.set(name,[]);names.get(name).push(org)}
 for(const fund of managedFunds) {
  const administrator=names.get(key(fund.administrator))?.[0]
  if(!administrator)continue
  for(const org of names.get(key(fund.name))||[])Object.assign(org,{entityType:'fund',administratorId:administrator.id,administratorName:administrator.name,administrationSourceUrl:fund.sourceUrl,fundUmbrella:fund.umbrella || null})
 }
 return data
}
const id = value => typeof value==='object'?value?.id:value
export function foldFundNodes(data) {
 applyFundHierarchy(data)
 const owners=new Map(data.organizations.filter(o=>o.administratorId).map(o=>[o.id,o.administratorId]))
 const resolve=value=>owners.get(id(value)) || id(value)
 return {...data,organizations:data.organizations.filter(o=>!owners.has(o.id)),relationships:data.relationships.map(r=>({...r,source:resolve(r.source),target:resolve(r.target),fundId:owners.has(id(r.source))?id(r.source):owners.has(id(r.target))?id(r.target):null})).filter(r=>r.source!==r.target)}
}
export function sliceColor(label) {
 let hash=0;for(const char of label)hash=(hash*31+char.charCodeAt(0))>>>0
 // Stable colors: a fund keeps its color on its administrator and recipients.
 return `hsl(${hash%360}, 62%, 48%)`
}
const dollars = r => (r.currency==='USD' || (!r.currency && /^\$/.test(r.amountLabel || ''))) && Number.isFinite(r.amount) && r.amount>0
function financialRecords(data,includeCapitalization=false) {
 const records=[],seen=new Set(),links=new Set()
 // Relationships and financing often describe the same award. Prefer the edge,
 // then add only financing evidence not represented there.
 for(const raw of [...data.relationships,...(data.financing || [])]) {
  if(!(raw.kind==='transfer' || (includeCapitalization && raw.kind==='capitalization')) || raw.status==='voided')continue
  const source=id(raw.source ?? raw.funderId),target=id(raw.target ?? raw.recipientId)
  if(!source || !target || source===target)continue
  const signature=JSON.stringify([source,target,raw.kind,raw.amount,raw.date,safeUrl(raw.sourceUrl)])
  if(seen.has(signature) || links.has(raw.id))continue
  seen.add(signature);if(raw.financingId)links.add(raw.financingId)
  records.push({...raw,source,target})
 }
 return records
}
// Index each record at its endpoints and direct fund administrator once.
// This preserves family accounting without scanning the full directory per node.
function familyRecords(data,records) {
 const organizations=new Map(data.organizations.map(o=>[o.id,o])),incoming=new Map(),outgoing=new Map(),administrators=new Set()
 for(const org of data.organizations)if(org.administratorId&&org.administratorId!==org.id)administrators.add(org.administratorId)
 const owners=value=>new Set([value,organizations.get(value)?.administratorId].filter(Boolean))
 const append=(map,key,record)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(record)}
 for(const record of records){
  const sources=owners(record.source),targets=owners(record.target)
  for(const target of targets)if(!sources.has(target))append(incoming,target,record)
  for(const source of sources)if(!targets.has(source))append(outgoing,source,record)
 }
 return {organizations,incoming,outgoing,administrators}
}
export function financialNodeTotals(data) {
 applyFundHierarchy(data)
 const {incoming,outgoing}=familyRecords(data,financialRecords(data).filter(dollars)),totals=new Map()
 for(const org of data.organizations)totals.set(org.id,{received:(incoming.get(org.id)||[]).reduce((sum,r)=>sum+r.amount,0),disbursed:(outgoing.get(org.id)||[]).reduce((sum,r)=>sum+r.amount,0)})
 return totals
}
export function financialNodePies(data,{includeCapitalization=false}={}) {
 applyFundHierarchy(data)
 const records=financialRecords(data,includeCapitalization)
 const {organizations,incoming:receipts,outgoing:awards,administrators}=familyRecords(data,records)
 const pies=new Map()
 for(const org of data.organizations) {
  const incoming=receipts.get(org.id)||[],outgoing=awards.get(org.id)||[]
  if(!incoming.length&&!outgoing.length)continue
  const administers=administrators.has(org.id)
  // Never mix receipts with onward awards: those can be the same dollars.
  const direction=administers&&outgoing.some(dollars)?'outgoing':incoming.some(dollars)?'incoming':'outgoing'
  const selected=direction==='incoming'?incoming:outgoing,groups=new Map()
  let omitted=0
  for(const r of selected) {
   if(!dollars(r)){omitted++;continue}
   const fund=organizations.get(r.source)
   const label=direction==='incoming'?(fund?.name || r.sourceLabel || r.funder):administers?(fund?.administratorId===org.id?fund.name:`${org.name} · other awards`):(organizations.get(r.target)?.name || r.targetLabel || r.recipient)
   const name=label || r.type || 'Disclosed funding'
   const slice=groups.get(name) || {label:name,amount:0,color:sliceColor(name),records:[]}
   slice.amount+=r.amount;slice.records.push(r);groups.set(name,slice)
  }
  const slices=[...groups.values()].sort((a,b)=>b.amount-a.amount || a.label.localeCompare(b.label)),total=slices.reduce((sum,s)=>sum+s.amount,0)
  let angle=-Math.PI/2
  for(const slice of slices){slice.share=slice.amount/total;slice.startAngle=angle;angle+=slice.share*Math.PI*2;slice.endAngle=angle}
  if(total)pies.set(org.id,{direction,total,slices,omitted,basis:direction==='incoming'?'Disclosed funding received by funder':administers?'Disclosed awards made by fund':'Disclosed awards made by recipient'})
 }
 return pies
}
export function pieWedgePath(x,y,r,start,end) {
 if(end-start>=Math.PI*2-1e-9)return `M ${x-r} ${y} a ${r} ${r} 0 1 0 ${r*2} 0 a ${r} ${r} 0 1 0 ${-r*2} 0`
 return `M ${x} ${y} L ${x+r*Math.cos(start)} ${y+r*Math.sin(start)} A ${r} ${r} 0 ${end-start>Math.PI?1:0} 1 ${x+r*Math.cos(end)} ${y+r*Math.sin(end)} Z`
}
export const formatPieAmount = amount => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(amount)
export function pieLabel(pie) {
 return pie?`${pie.basis}: ${pie.slices.map(s=>`${s.label} ${formatPieAmount(s.amount)} (${(s.share*100).toFixed(1)}%)`).join('; ')}. Recorded awards across dates, not fund balances; payment unverified.`:'Funding amount undisclosed'
}
