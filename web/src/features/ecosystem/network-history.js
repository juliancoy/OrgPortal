import {key,safeUrl} from './ecosystem.js'
export function mergeNetworkHistory(base,history){
 const data=structuredClone(base),ids=new Map(),byName=new Map()
 for(const org of data.organizations)byName.set(key(org.name),org.id)
 for(const org of history.organizations){
  const id=byName.get(key(org.name)) || org.id;ids.set(org.id,id)
  if(!byName.has(key(org.name))){data.organizations.push(org);byName.set(key(org.name),id)}
 }
 data.events=(history.events || []).map(event=>({...event,organizationId:ids.get(event.organizationId) || null}))
 for(const record of history.relationships){
  const edge={...record,source:ids.get(record.source),target:ids.get(record.target)}
  if(!data.relationships.some(r=>r.id===edge.id || (r.source===edge.source && r.target===edge.target && r.amount===edge.amount && r.date===edge.date && safeUrl(r.sourceUrl)===safeUrl(edge.sourceUrl))))data.relationships.push(edge)
 }
 for(const record of history.financing){
  const edge={...record,funderId:ids.get(record.funderId),recipientId:ids.get(record.recipientId)}
  if(!data.financing.some(r=>r.id===edge.id || (r.funderId===edge.funderId && r.recipientId===edge.recipientId && r.amount===edge.amount && r.date===edge.date && safeUrl(r.sourceUrl)===safeUrl(edge.sourceUrl))))data.financing.push(edge)
 }
 return data
}
