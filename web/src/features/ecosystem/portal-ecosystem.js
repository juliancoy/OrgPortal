import { key, safeUrl, applyGovernmentClasses, governmentCategory } from './ecosystem.js'
const moneyKinds = new Set(['transfer', 'terms', 'capitalization', 'portfolio', 'coinvestment'])
const graphKinds = new Set(['transfer','affiliation','incubation','acceleration','collaboration','services','mentoring','venue','in_kind'])
export function graphRelationships(data, { moneyOnly = false, includeCapitalization = false } = {}) {
 return data.relationships.filter(r => r.source && r.target && (graphKinds.has(r.kind || r.relationship) || (includeCapitalization && r.kind === 'capitalization')) && (!moneyOnly || r.kind === 'transfer' || (includeCapitalization && r.kind === 'capitalization')))
}
export function mergePortalEvidence(base, organizations, records, refreshedAt = new Date().toISOString()) {
 const data = structuredClone(base)
 data.relationships=data.relationships.filter(r=>!r.id.startsWith('portal:'))
 data.financing=data.financing.filter(r=>!r.id.startsWith('portal:'))
 const byId = new Map(data.organizations.map(o => [o.id,o])), mapping = new Map()
 for (const org of organizations) {
  const matches=data.organizations.filter(o => o.id===org.id || key(o.name)===key(org.name) || (safeUrl(o.website) && safeUrl(o.website)===safeUrl(org.source_url)))
  const match=matches.find(o=>o.id===org.id) || (matches.length===1 ? matches[0] : null)
  const id=match?.id || org.id;mapping.set(org.id,id)
  if(match && governmentCategory(org))match.category=governmentCategory(org)
  if (!match) byId.set(id,{id,name:org.name,type:(org.tags || []).includes('Venture')?'Venture':'Organization',category:governmentCategory(org) || ((org.tags || []).includes('Venture')?'company':'general'),website:safeUrl(org.source_url),relevance:org.description || '',proximity:null,directory:true,publicEmails:[],sourceRows:[],sourceCategory:'OrgPortal',portalSlug:org.slug})
 }
 data.organizations=[...byId.values()];applyGovernmentClasses(data)
 const known=new Set()
 for(const record of records) {
  if(record.record_type!=='organization_support' || record.status==='voided')continue
  const rid=record.record_id || record.id.replace(/^support:/,'')
  if(known.has(rid))continue;known.add(rid)
  if(rid.startsWith('bmoremedtech:')){continue}
  const kind=record.transaction_type
  const source=record.from_organization_id ? mapping.get(record.from_organization_id) || null:null
  const target=record.to_organization_id ? mapping.get(record.to_organization_id) || null:null
  const edge={id:'portal:'+rid,source,target,sourceLabel:record.from_label || '',targetLabel:record.to_label || '',relationship:moneyKinds.has(kind)?'funding':kind,kind,amount:record.amount,amountLabel:record.amount_label || (record.amount==null ? (kind==='transfer'?'Undisclosed':'') : `${record.currency || ''} ${record.amount.toLocaleString()}`),currency:record.currency,type:record.description,date:record.occurred_at,description:record.description,sourceUrl:safeUrl(record.source_url),evidence:record.evidence,notes:record.notes,status:record.status,provenance:{sheet:'OrgPortal public evidence'}}
  data.relationships.push(edge)
  if(moneyKinds.has(kind))data.financing.push({...edge,funderId:source,recipientId:target,funder:edge.sourceLabel,recipient:edge.targetLabel,scope:record.notes})
 }
 // The original workbook and its portal import are the same evidence, not two flows.
 data.portalUpdatedAt=refreshedAt;data.portalRecordCount=known.size
 return data
}
export async function loadPortalEvidence(base, fetcher = fetch, prefix='/api/org/api/network') {
 const get=async path=>{const response=await fetcher(prefix+path);if(!response.ok)throw new Error(`Public evidence unavailable (${response.status})`);return response.json()}
 const directory=[]
 for(let offset=0;;offset+=500){
  const page=await get(`/orgs/public?limit=500&offset=${offset}`)
  if(!Array.isArray(page))throw new Error('Organization directory is incomplete')
  directory.push(...page)
  if(page.length<500)break
 }
 const scoped=directory
 const records=[], queue=[...scoped]
 await Promise.all(Array.from({length:Math.min(6,queue.length)},async()=>{
  while(queue.length){const org=queue.shift();let offset=0;do{const result=await get('/orgs/public/'+encodeURIComponent(org.slug)+`/support?offset=${offset}`);if(!Array.isArray(result.records) || (result.nextRecordOffset!==null && (!Number.isInteger(result.nextRecordOffset) || result.nextRecordOffset<=offset)))throw new Error('Support evidence is incomplete');records.push(...result.records);offset=result.nextRecordOffset;}while(offset!==null)}
 }))
 const endpoints=new Set(records.flatMap(r=>[r.from_organization_id,r.to_organization_id]).filter(Boolean))
 const included=directory.filter(o=>scoped.some(s=>s.id===o.id) || endpoints.has(o.id))
 return mergePortalEvidence(base,included,records)
}

export function financialNodeAmounts(data, {includeCapitalization = false} = {}) {
 const amounts = new Map()
 for (const edge of graphRelationships(data, {moneyOnly:true, includeCapitalization})) {
  if (!(edge.currency === 'USD' || (!edge.currency && /^\$/.test(edge.amountLabel || ''))) || !Number.isFinite(edge.amount) || edge.amount <= 0) continue
  for (const id of [edge.source,edge.target]) amounts.set(id,Math.max(amounts.get(id) || 0,edge.amount))
 }
 return amounts
}
export const financialNodeRadius = amount => 6 + (Number.isFinite(amount) && amount > 0 ? 2 * Math.log10(1 + amount) : 0)
