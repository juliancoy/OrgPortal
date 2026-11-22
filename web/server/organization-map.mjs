// A complete, direct neighborhood, compacted by ordered pair without summing money.
export async function organizationMap(read, readRows, manifest, params, meta) {
 const version=manifest.version,handle=params.get('org')
 if(!handle||handle.length>300)throw Error('Invalid organization reference')
 const integer=(key,fallback,max)=>{const value=params.get(key);if(value===null)return fallback;if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>max)throw Error(`Invalid ${key}`);return Number(value)}
 const offset=integer('offset',0,1e7),limit=integer('limit',200,250);if(!limit)throw Error('Invalid limit')
 const aliases=await read(`${version}/organization-evidence/index.json`)
 if(!Object.hasOwn(aliases,handle))return {body:{...meta,anchor:null,organizations:[],relationships:[],total:0,incoming:0,outgoing:0,offset,nextOffset:null}}
 const position=aliases[handle];if(!Number.isSafeInteger(position)||position<0)throw Error('Invalid ambiguous organization reference')
 const profile=manifest.organizationEvidenceIndexVersion===1?(await readRows(read,version,'organization-evidence',[position]))[0]:await read(`${version}/organization-evidence/${position}.json`)
 const selected=profile.organization.id,topology=await read(`${version}/topology.json`),index=await read(`${version}/organizations/index.json`)
 const nodeId=value=>typeof value==='number'?topology.nodeIds[value]:value
 const neighbors=new Set(),incoming=new Set(),outgoing=new Set(),pairs=new Map()
 for(const edgeIndex of topology.edgesByOrg[selected]||[]){
  const edge=topology.edges[edgeIndex],source=nodeId(edge[0]),target=nodeId(edge[1])
  if(source===target||source!==selected&&target!==selected)continue
  const neighbor=source===selected?target:source;neighbors.add(neighbor)
  if(source===selected)outgoing.add(neighbor);else incoming.add(neighbor)
  const key=JSON.stringify([source,target]),pair=pairs.get(key)||{id:key,source,target,recordCount:0,kinds:[]}
  pair.recordCount++;if(!pair.kinds.includes(edge[2]))pair.kinds.push(edge[2]);pairs.set(key,pair)
 }
 const ids=[...neighbors].sort(),visible=new Set(ids.slice(offset,offset+limit));visible.add(selected)
 const positions=new Map(index.rows.map((row,i)=>[row.id,i]))
 if([...visible].some(id=>!positions.has(id)))throw Error('Organization map contains an unresolved endpoint')
 const organizations=(await readRows(read,version,'organizations',[...visible].map(id=>positions.get(id)))).map(org=>({id:org.id,name:org.name,slug:org.portalSlug||null,category:org.category||'general',type:org.type||''}))
 return {body:{...meta,anchor:selected,organizations,relationships:[...pairs.values()].filter(edge=>visible.has(edge.source)&&visible.has(edge.target)),total:ids.length,incoming:incoming.size,outgoing:outgoing.size,offset,nextOffset:offset+limit<ids.length?offset+limit:null}}
}
