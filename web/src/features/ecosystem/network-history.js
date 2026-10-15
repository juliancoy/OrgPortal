import {key,safeUrl,applyGovernmentClasses} from './ecosystem.js'
export function mergeNetworkHistory(base,history){
 const data=structuredClone(base),ids=new Map(),byName=new Map()
 if(history.nonprofitCoverage){
  data.relationships=data.relationships.filter(r=>!r.id.startsWith('irs990:'))
  data.financing=data.financing.filter(r=>!r.id.startsWith('irs990:'))
 }
 if(history.governmentCoverage){
  data.relationships=data.relationships.filter(r=>!r.awardKey?.startsWith('usaspending:'))
  data.financing=data.financing.filter(r=>!r.awardKey?.startsWith('usaspending:'))
 }
 for(const org of data.organizations)byName.set(key(org.name),org.id)
 for(const org of history.organizations){
  const identityMatch=org.identifiers && data.organizations.find(candidate=>Object.entries(org.identifiers).some(([field,value])=>value && candidate.identifiers?.[field]===value))
  const id=identityMatch?.id || (org.identifiers?.ein || org.identifiers?.uei || org.identifiers?.usaspendingRecipientId ? org.id : byName.get(key(org.name))) || org.id;ids.set(org.id,id)
  if(!data.organizations.some(candidate=>candidate.id===id)){data.organizations.push(org);byName.set(key(org.name),id)}
 }
 if(history.governmentCoverage)data.governmentCoverage=history.governmentCoverage
 if(history.nonprofitCoverage){data.nonprofitCoverage=history.nonprofitCoverage;data.nonprofitProfiles=history.nonprofitProfiles.map(profile=>({...profile,organizationId:ids.get(profile.organizationId)||profile.organizationId}))}
 if(Array.isArray(history.events))data.events=history.events.map(event=>({...event,organizationId:ids.get(event.organizationId) || null}))
 for(const record of history.relationships){
  const edge={...record,source:ids.get(record.source)??record.source??null,target:ids.get(record.target)??record.target??null}
  if(!data.relationships.some(r=>r.id===edge.id || (edge.awardKey && r.awardKey===edge.awardKey) || (!edge.awardKey && !r.awardKey && r.source===edge.source && r.target===edge.target && r.amount===edge.amount && r.date===edge.date && safeUrl(r.sourceUrl)===safeUrl(edge.sourceUrl))))data.relationships.push(edge)
 }
 for(const record of history.financing){
  const edge={...record,funderId:ids.get(record.funderId)??record.funderId??null,recipientId:ids.get(record.recipientId)??record.recipientId??null}
  if(!data.financing.some(r=>r.id===edge.id || (edge.awardKey && r.awardKey===edge.awardKey) || (!edge.awardKey && !r.awardKey && r.funderId===edge.funderId && r.recipientId===edge.recipientId && r.amount===edge.amount && r.date===edge.date && safeUrl(r.sourceUrl)===safeUrl(edge.sourceUrl))))data.financing.push(edge)
 }
 return applyGovernmentClasses(data)
}

export function appendNonprofitEvidence(history,nonprofit){
 return {...history,organizations:[...history.organizations,...nonprofit.organizations],relationships:[...history.relationships,...nonprofit.relationships],financing:[...history.financing,...nonprofit.financing],nonprofitCoverage:nonprofit.nonprofitCoverage,nonprofitProfiles:nonprofit.nonprofitProfiles}
}
