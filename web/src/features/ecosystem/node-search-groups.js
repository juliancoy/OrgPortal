// Search presentation only. Equal labels do not establish a shared legal identity.
export const nodeSearchNameKey=name=>name.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu,' ')
export function groupNodeSearchResults(nodes){
 const groups=new Map()
 for(const node of nodes){
  const key=nodeSearchNameKey(node.name)
  if(!groups.has(key))groups.set(key,{id:node.id,name:node.name,type:node.type,members:[]})
  const group=groups.get(key)
  if(!group.members.some(member=>member.id===node.id))group.members.push({id:node.id,name:node.name,type:node.type})
 }
 return [...groups.values()]
}
export function nodeSearchSource(node){
 const [namespace,source,role]=node.id.split(':')
 if(namespace==='source-label'){
  const names={maryland_comptroller:'Maryland Comptroller',nonprofit_grant:'Nonprofit grants',federal_usaspending:'USAspending'}
  return `${names[source]||source.replaceAll('_',' ')} · ${role||'source'} label`
 }
 if(namespace==='usgov'&&source==='recipient')return `USAspending · Recipient ${role}`
 if(namespace==='nonprofit')return `Nonprofit · EIN ${source}`
 return node.type||'Organization'
}
