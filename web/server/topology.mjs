// Keep transaction identities and exact dates while avoiding a large array of
// allocated edge objects. Old snapshots remain readable during deployment.
const loaded=new WeakMap()
export async function readTopology(read,version){
 const header=await read(`${version}/topology.json`)
 if(!header.packedTopologyVersion)return header
 let cached=loaded.get(read)
 if(cached?.version===version)return cached.promise
 const promise=decodeTopology(read,version,header)
 loaded.set(read,{version,promise})
 try{return await promise}catch(error){if(loaded.get(read)?.promise===promise)loaded.delete(read);throw error}
}
async function decodeTopology(read,version,header){
 if(header.packedTopologyVersion!==1||!Number.isSafeInteger(header.edgeCount)||header.edgeCount<0||!Number.isSafeInteger(header.edgeShardSize)||header.edgeShardSize<1)throw Error('Invalid topology encoding')
 const shards=[]
 // Sequential reads bound temporary JSON allocations and release each raw shard.
 for(let start=0;start<header.edgeCount;start+=header.edgeShardSize){
  const values=await read(`${version}/topology/edges-${start/header.edgeShardSize}.json`)
  if(values.length!==Math.min(header.edgeShardSize,header.edgeCount-start)*5||values.some(v=>!Number.isInteger(v)||v<0||v>0xffffffff))throw Error('Invalid topology edge shard')
  shards.push(Uint32Array.from(values))
 }
 const at=index=>{
  if(!Number.isSafeInteger(index)||index<0||index>=header.edgeCount)return undefined
  const row=shards[Math.floor(index/header.edgeShardSize)],offset=index%header.edgeShardSize*5
  return [row[offset],row[offset+1],header.edgeKinds[row[offset+2]],header.edgeDates[row[offset+3]],header.edgeYears[row[offset+4]]]
 }
 const methods={length:header.edgeCount,at,
  *[Symbol.iterator](){for(let i=0;i<header.edgeCount;i++)yield at(i)},
  forEach(fn){for(let i=0;i<header.edgeCount;i++)fn(at(i),i)},
  filter(fn){const result=[];for(let i=0;i<header.edgeCount;i++){const row=at(i);if(fn(row,i))result.push(row)}return result},
  map(fn){return Array.from({length:header.edgeCount},(_,i)=>fn(at(i),i))},
 }
 const edges=new Proxy(methods,{get:(target,key)=>typeof key==='string'&&/^\d+$/.test(key)?at(Number(key)):Reflect.get(target,key)})
 const byId=values=>Object.fromEntries(header.nodeIds.map((id,i)=>[id,values[i]]))
 return {...header,edges,adjacency:byId(header.adjacency),degree:byId(header.degree),edgesByOrg:byId(header.edgesByOrg)}
}

export async function writePackedTopology(topology,write,{shardSize=25000}={}){
 const nodeIds=topology.nodeIds||Object.keys(topology.adjacency),positions=new Map(nodeIds.map((id,i)=>[id,i]))
 const dictionaries=[[],[],[]],lookups=[new Map(),new Map(),new Map()]
 const intern=(value,column)=>{const lookup=lookups[column];if(!lookup.has(value)){lookup.set(value,dictionaries[column].length);dictionaries[column].push(value)}return lookup.get(value)}
 const node=value=>typeof value==='number'?value:positions.get(value)
 for(let start=0;start<topology.edges.length;start+=shardSize){
  const values=[]
  for(const [a,b,kind,date,year] of topology.edges.slice(start,start+shardSize)){
   const from=node(a),to=node(b);if(!Number.isInteger(from)||!Number.isInteger(to))throw Error('Unresolved topology endpoint')
   values.push(from,to,intern(kind||'',0),intern(date||'',1),intern(year||null,2))
  }
  await write(`topology/edges-${start/shardSize}.json`,values)
 }
 await write('topology.json',{...topology,edges:undefined,nodeIds,packedTopologyVersion:1,edgeCount:topology.edges.length,edgeShardSize:shardSize,
  edgeKinds:dictionaries[0],edgeDates:dictionaries[1],edgeYears:dictionaries[2],
  adjacency:nodeIds.map(id=>(topology.adjacency[id]||[]).map(node)),degree:nodeIds.map(id=>topology.degree[id]||0),edgesByOrg:nodeIds.map(id=>topology.edgesByOrg[id]||[]),
 })
}
