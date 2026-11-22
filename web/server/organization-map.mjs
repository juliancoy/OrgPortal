import {organizationGroup} from './organization-group.mjs'
// Keep only compact public neighborhoods, scoped to the artifact reader and
// snapshot. The raw topology + search indexes exceed the artifact cache budget;
// rereading them for every 250-node page caused repeated parsing and GC.
const readers=new WeakMap(),maxBytes=16*1024*1024,maxEntries=12
async function neighborhood(read,readRows,manifest,params){
 let cache=readers.get(read)
 if(!cache||cache.version!==manifest.version){cache={version:manifest.version,entries:new Map(),pending:new Map(),bytes:0};readers.set(read,cache)}
 const key=JSON.stringify([params.get('org'),params.get('members')])
 if(cache.entries.has(key)){const item=cache.entries.get(key);cache.entries.delete(key);cache.entries.set(key,item);return item.value}
 if(cache.pending.has(key))return cache.pending.get(key)
 const request=buildNeighborhood(read,readRows,manifest,params).then(value=>{
  const bytes=new TextEncoder().encode(JSON.stringify(value)).byteLength*3
  if(bytes<=maxBytes){cache.entries.set(key,{value,bytes});cache.bytes+=bytes
   while(cache.bytes>maxBytes||cache.entries.size>maxEntries){const first=cache.entries.keys().next().value;cache.bytes-=cache.entries.get(first).bytes;cache.entries.delete(first)}}
  return value
 })
 cache.pending.set(key,request);try{return await request}finally{cache.pending.delete(key)}
}
// A complete, direct neighborhood, compacted by ordered pair without summing money.
export async function organizationMap(read, readRows, manifest, params, meta) {
 const handle=params.get('org')
 if(!handle||handle.length>300)throw Error('Invalid organization reference')
 const integer=(key,fallback,max)=>{const value=params.get(key);if(value===null)return fallback;if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>max)throw Error(`Invalid ${key}`);return Number(value)}
 const offset=integer('offset',0,1e7),limit=integer('limit',200,250);if(!limit)throw Error('Invalid limit')
 const map=await neighborhood(read,readRows,manifest,params)
 const selected=map.positions.slice(offset,offset+limit)
 if(map.anchor)selected.push(map.anchor.position)
 // Keep detail reads paginated even in runtimes with request-scoped readers.
 // A small request must not fetch every organization's full evidence metrics.
 const organizations=(await readRows(read,manifest.version,'organizations',selected)).map(org=>({id:org.id,name:org.name,slug:org.portalSlug||null,category:org.category||'general',type:org.type||''}))
 const visible=new Set(organizations.map(org=>org.id))
 return {body:{...meta,anchor:map.anchor?.id||null,organizations,relationships:map.relationships.filter(edge=>visible.has(edge.source)&&visible.has(edge.target)),total:map.positions.length,incoming:map.incoming,outgoing:map.outgoing,offset,nextOffset:offset+limit<map.positions.length?offset+limit:null}}
}
async function buildNeighborhood(read,readRows,manifest,params){
 const version=manifest.version
 const profile=await organizationGroup(read,readRows,manifest,params)
 if(!profile)return {anchor:null,positions:[],relationships:[],incoming:0,outgoing:0}
 const selected=profile.organization.id,topology=await read(`${version}/topology.json`),index=await read(`${version}/organizations/index.json`)
 const members=new Set(profile.members.map(member=>member.id))
 const nodeId=value=>typeof value==='number'?topology.nodeIds[value]:value
 const neighbors=new Set(),incoming=new Set(),outgoing=new Set(),pairs=new Map()
 const add=(from,to,kind)=>{
  const source=members.has(from)?selected:from,target=members.has(to)?selected:to
  if(source===target||source!==selected&&target!==selected)return
  const neighbor=source===selected?target:source;neighbors.add(neighbor)
  if(source===selected)outgoing.add(neighbor);else incoming.add(neighbor)
  const key=JSON.stringify([source,target]),pair=pairs.get(key)||{id:key,source,target,recordCount:0,kinds:[]}
  pair.recordCount++;if(!pair.kinds.includes(kind))pair.kinds.push(kind);pairs.set(key,pair)
 }
 for(const edgeIndex of new Set([...members].flatMap(id=>topology.edgesByOrg[id]||[]))){const edge=topology.edges[edgeIndex];add(nodeId(edge[0]),nodeId(edge[1]),edge[2])}
 // Program offerings are nonfinancial relationships, even though the network's
 // financial topology excludes them. They belong in the organization neighborhood.
 for(const row of await readRows(read,version,'relationships',profile.recordKinds?.terms||[]))if(row.status!=='voided')add(row.source,row.target,'terms')
 const ids=[...neighbors].sort();ids.push(selected)
 const positions=new Map(index.rows.map((row,i)=>[row.id,i]))
 if(ids.some(id=>!positions.has(id)))throw Error('Organization map contains an unresolved endpoint')
 ids.pop()
 return {anchor:{id:selected,position:positions.get(selected)},positions:ids.map(id=>positions.get(id)),relationships:[...pairs.values()],incoming:incoming.size,outgoing:outgoing.size}
}
