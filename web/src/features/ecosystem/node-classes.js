// Placeholder classes retain evidence without claiming a real organization identity.
export const notApplicableOrganization = {
 id:'source-class:not-applicable', name:'Not applicable', nodeClass:'not-applicable',
 category:'not-applicable', type:'Not applicable source records', entityType:'placeholder',
 identityStatus:'not_applicable', directory:false,
 relevance:'Grouping for source records whose counterparty is not applicable. Not a single organization or evidence that the counterparties are connected.',
}
export const isNotApplicableLabel=value=>/^(?:not\s+applicable|n\s*\/\s*a)$/i.test(String(value??'').trim())
export function isNotApplicableNode(node){
 if(!node)return false
 if(node.nodeClass==='not-applicable'||node.category==='not-applicable'||node.identityStatus==='not_applicable')return true
 const sourceId=node.serverCommunity||node.id||''
 if(node.entityType!=='source_label'&&!String(sourceId).startsWith('source-label:'))return false
 // Older query indexes retain only search text; support them until the next export.
 const label=node.name??String(node.search||'').replace(/\s+source label(?:\s.*)?$/i,'')
 return isNotApplicableLabel(node.serverCommunity?label.replace(/ community · \d+ organizations$/,''):label)
}
