// Display-only groups explicitly approved for visual combination. No identity or permission changes.
export const visualDuplicateGroups=[{id:'org-tedco',name:'TEDCO',members:['org-tedco','52313b5e-6e69-47bc-960b-e379a9292b6f','8a3e14ab-caec-4a2a-9d37-8b49b078b5e3']}]
export const visualDuplicateGroup=id=>visualDuplicateGroups.find(group=>group.members.includes(id))
export const visualOrganizationId=(id,separate=false)=>separate?id:visualDuplicateGroup(id)?.id||id
export function combineVisualOrganizations(pages,{separate=false}={}){
 const base=pages[0],organizations=new Map(),relationships=new Map()
 for(const page of pages){
  if(base.version&&page.version!==base.version)throw Error('Visual groups require one snapshot')
  for(const org of page.organizations)organizations.set(org.id,org)
  for(const edge of page.relationships)relationships.set(edge.id,edge)
 }
 if(!separate)for(const group of visualDuplicateGroups){
  const members=group.members.map(id=>organizations.get(id)).filter(Boolean);if(!members.length)continue
  const primary=organizations.get(group.id)||members[0]
  for(const member of members)organizations.delete(member.id)
  organizations.set(group.id,{...primary,id:group.id,name:group.name,visualGroup:members.map(({id,name,website,portalSlug})=>({id,name,website,portalSlug}))})
 }
 const endpoint=value=>typeof value==='object'?value?.id:value
 return {...base,organizations:[...organizations.values()].map(org=>separate&&visualDuplicateGroup(org.id)?{...org,visualSeparatedGroup:visualDuplicateGroup(org.id).id}:org),relationships:[...relationships.values()].map(edge=>({...edge,visualOriginalSource:edge.source,visualOriginalTarget:edge.target,source:visualOrganizationId(endpoint(edge.source),separate),target:visualOrganizationId(endpoint(edge.target),separate)})),total:pages.length>1?organizations.size:base.total}
}
