import { key, safeUrl, applyGovernmentClasses, governmentCategory } from './ecosystem.js'
const moneyKinds = new Set(['grant','donation','contract','transfer', 'terms', 'capitalization', 'portfolio', 'coinvestment'])
const graphKinds = new Set(['grant','donation','contract','transfer','affiliation','incubation','acceleration','collaboration','services','mentoring','venue','in_kind'])
export function graphRelationships(data, { moneyOnly = false, includeCapitalization = false } = {}) {
 return data.relationships.filter(r => r.source && r.target && (graphKinds.has(r.kind || r.relationship) || (includeCapitalization && r.kind === 'capitalization')) && (!moneyOnly || ['transfer','grant','donation','contract'].includes(r.kind) || (includeCapitalization && r.kind === 'capitalization')))
}
export function mergePortalEvidence(base, organizations, records, refreshedAt = new Date().toISOString()) {
 const data = structuredClone(base)
 data.relationships=data.relationships.filter(r=>!r.id.startsWith('portal:'))
 data.financing=data.financing.filter(r=>!r.id.startsWith('portal:'))
 const byId = new Map(data.organizations.map(o => [o.id,o])), mapping = new Map()
 // Normalize the snapshot once, rather than reparsing every website for every
 // directory row. Keep ambiguous name/website matches separate from exact IDs.
 const names=new Map(),websites=new Map()
 const index=(map,value,org)=>{if(!value)return;if(!map.has(value))map.set(value,[]);map.get(value).push(org)}
 for(const org of data.organizations){if(org.identifiers?.ein)continue;index(names,key(org.name),org);index(websites,safeUrl(org.website),org)}
 const snapshotIds=new Map(byId)
 for (const org of organizations) {
  const candidates=new Set([...(names.get(key(org.name))||[]),...(websites.get(safeUrl(org.source_url))||[])])
  const match=snapshotIds.get(org.id) || (candidates.size===1 ? [...candidates][0] : null)
  const id=match?.id || org.id;mapping.set(org.id,id)
  const image=safeUrl(org.image_url)
  const category=governmentCategory(org) || ((org.tags || []).includes('Fiscal organization')?'funding':null)
  if(match && org.slug)match.portalSlug=org.slug
  if(match && 'image_url' in org && (image || match.imageCaption!=='Published website preview image')){match.imageUrl=image;match.imageSourceUrl=safeUrl(org.source_url);match.portalSlug=org.slug}
  if(match && category)match.category=category
  if (!match) byId.set(id,{id,name:org.name,type:(org.tags || []).includes('Venture')?'Venture':'Organization',category:category || ((org.tags || []).includes('Venture')?'company':'general'),website:safeUrl(org.source_url),relevance:org.description || '',proximity:null,directory:true,publicEmails:[],sourceRows:[],sourceCategory:'OrgPortal',portalSlug:org.slug,imageUrl:image,imageSourceUrl:safeUrl(org.source_url)})
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
export async function loadPortalEvidence(base, fetcher = fetch, prefix='/api/org/api/network',merge=mergePortalEvidence) {
 const get=async path=>{const response=await fetcher(prefix+path);if(!response.ok)throw new Error(`Public evidence unavailable (${response.status})`);return response.json()}
 const directory=[]
 for(let offset=0;;offset+=500){
  const page=await get(`/orgs/public?limit=500&offset=${offset}`)
  if(!Array.isArray(page))throw new Error('Organization directory is incomplete')
  directory.push(...page)
  if(page.length<500)break
 }
 const scoped=directory
 const records=[]
 // One paginated public feed avoids a report request for every organization.
 let offset=0,legacy=false
 do {
  const response=await fetcher(prefix+`/relationships/public?offset=${offset}`)
  if(response.status===404 || response.status===501){legacy=true;break}
  if(!response.ok)throw new Error(`Public evidence unavailable (${response.status})`)
  const result=await response.json()
  if(!Array.isArray(result.records) || (result.nextRecordOffset!==null && (!Number.isInteger(result.nextRecordOffset) || result.nextRecordOffset<=offset)))throw new Error('Support evidence is incomplete')
  records.push(...result.records);offset=result.nextRecordOffset
 }while(offset!==null)
 if(legacy){
 records.length=0
 const queue=[...scoped]
 await Promise.all(Array.from({length:Math.min(6,queue.length)},async()=>{
  while(queue.length){const org=queue.shift();let offset=0;do{const result=await get('/orgs/public/'+encodeURIComponent(org.slug)+`/support?offset=${offset}`);if(!Array.isArray(result.records) || (result.nextRecordOffset!==null && (!Number.isInteger(result.nextRecordOffset) || result.nextRecordOffset<=offset)))throw new Error('Support evidence is incomplete');records.push(...result.records);offset=result.nextRecordOffset;}while(offset!==null)}
 }))
 }
 return merge(base,directory,records)
}

export function financialNodeAmounts(data, {includeCapitalization = false} = {}) {
 const amounts = new Map(), seen = new Set()
 for (const edge of graphRelationships(data, {moneyOnly:true, includeCapitalization})) {
  const identity=edge.awardKey || edge.id
  if(edge.status==='voided'||(identity&&seen.has(identity)))continue
  if(identity)seen.add(identity)
  if (!(edge.currency === 'USD' || (!edge.currency && /^\$/.test(edge.amountLabel || ''))) || !Number.isFinite(edge.amount) || edge.amount <= 0) continue
  for (const id of new Set([edge.source,edge.target])) amounts.set(id,(amounts.get(id) || 0)+edge.amount)
 }
 return amounts
}
// Normalize against the full evidence set so filtering cannot resize a company.
// Bound the output and exponent so even exponential scaling stays finite.
export function financialNodeRadius(amount,{algorithm='log',alpha=1,maxAmount=1e11}={}) {
 if(!Number.isFinite(amount)||amount<=0)return 6
 const a=Number.isFinite(alpha)?Math.max(.1,Math.min(5,alpha)):1
 const reference=Number.isFinite(maxAmount)&&maxAmount>0?maxAmount:amount
 const x=Math.min(1,amount/reference)
 let scaled
 switch(algorithm){
  case 'linear':scaled=Math.min(1,a*x);break
  case 'exp':scaled=Math.expm1(a*x)/Math.expm1(a);break
  case 'power':scaled=x**a;break
  default:scaled=Math.log1p(9*a*x)/Math.log1p(9*a)
 }
 return 6+24*scaled
}
