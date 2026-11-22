// Public evidence profiles: no directory writes, inferred owners, or name matching.
export function organizationEvidenceProfiles(data) {
 const nodes = new Map(data.organizations.map(org => [org.id, org])), children = new Map(), parents = new Map()
 function connect(parent, child, classification, sourceUrl) {
  if (parent === child || !nodes.has(parent) || !nodes.has(child)) return
  const relation = {parent,child,classification:classification || 'organization',sourceUrl:sourceUrl || ''}
  if (!children.has(parent)) children.set(parent,new Map())
  if (!parents.has(child)) parents.set(child,new Map())
  children.get(parent).set(child,relation); parents.get(child).set(parent,relation)
 }
 for (const org of nodes.values()) {
  if (org.governmentParentId) connect(org.governmentParentId,org.id,org.governmentClassification,org.governmentSourceUrl)
  for (const member of org.governmentMembers || []) connect(org.id,member.id,member.classification,org.governmentSourceUrl)
 }
 for (const row of data.relationships) if (row.status !== 'voided' && row.kind === 'agency' && row.relationship === 'affiliation') {
  const child = nodes.get(row.target)
  connect(row.source,row.target,child?.governmentClassification,row.sourceUrl)
 }
 const recordIndices = new Map(), recordKinds = new Map(), groups = new Map(), seen = new Set()
 for (let index=0;index<data.relationships.length;index++) {
  const row=data.relationships[index],key=row.transactionRecordId || row.id
  if (seen.has(key)) continue
  seen.add(key)
  for (const id of new Set([row.source,row.target])) {
   if (!nodes.has(id)) continue
   if (!recordIndices.has(id)) recordIndices.set(id,[])
   recordIndices.get(id).push(index)
   if (!recordKinds.has(id)) recordKinds.set(id,Object.create(null))
   const kind=row.kind||row.relationship||'other';(recordKinds.get(id)[kind]??=[]).push(index)
   if (!groups.has(id)) groups.set(id,new Map())
   const group={kind:row.kind||row.relationship||'other',factType:row.financialFactType||'',measurement:row.measurement||'',fiscalYear:row.fiscalYear||null,currency:row.currency||null,status:row.status||'',sourceSystem:row.sourceSystem||'',sourceDataset:row.sourceDataset||''}
   const groupKey=JSON.stringify(group),previous=groups.get(id).get(groupKey)
   groups.get(id).set(groupKey,{...group,count:(previous?.count||0)+1})
  }
 }
 const brief=id=>{const org=nodes.get(id);return {id,name:org.name,slug:org.portalSlug||null,type:org.type||'',classification:org.governmentClassification||'',recordCount:recordIndices.get(id)?.length||0}}
 const entries=[...nodes.keys()].sort().map(id=>({organization:brief(id),parents:[...(parents.get(id)?.values()||[])].map(r=>({...brief(r.parent),classification:r.classification,sourceUrl:r.sourceUrl})),children:[...(children.get(id)?.values()||[])].map(r=>({...brief(r.child),classification:r.classification,sourceUrl:r.sourceUrl})).sort((a,b)=>a.name.localeCompare(b.name)),groups:[...(groups.get(id)?.values()||[])],recordKinds:recordKinds.get(id)||{},recordIndices:recordIndices.get(id)||[]}))
 const aliases=Object.create(null)
 entries.forEach((entry,index)=>{for(const alias of new Set([entry.organization.id,entry.organization.slug].filter(Boolean))){if(Object.hasOwn(aliases,alias)&&aliases[alias]!==index)aliases[alias]=null;else aliases[alias]=index}})
 return {aliases,entries}
}
