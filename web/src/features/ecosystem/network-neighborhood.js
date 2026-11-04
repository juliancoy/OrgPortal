/** Load organization pages first, then complete transaction evidence with bounded concurrency. */
export async function loadNeighborhoodPages(fetchPage,parameters,onProgress=()=>{}){
 const organizations=new Map(),relationships=new Map(),visited=new Set(),evidence=[]
 let first,version=parameters.version
 async function read(offset,edgeOffset){
  const key=offset+':'+edgeOffset
  if(visited.has(key))throw Error('Neighborhood pagination did not advance. Retry loading the network.')
  visited.add(key)
  const page=await fetchPage({...parameters,offset:String(offset),edgeOffset:String(edgeOffset),...(version?{version}:{})})
  if(!first){first=page;version=page.version}
  if(page.version!==version)throw Error('The network snapshot changed while loading. Retry to load a consistent neighborhood.')
  if(!Array.isArray(page.organizations)||!Array.isArray(page.relationships))throw Error('The neighborhood response is incomplete. Retry loading the network.')
  const before=organizations.size
  for(const node of page.organizations)organizations.set(node.id,node)
  for(const row of page.relationships)relationships.set(row.id,row)
  onProgress({loaded:organizations.size,total:first.total,records:relationships.size,phase:edgeOffset?'evidence':'organizations',page:organizations.size>before?{...first,organizations:[...organizations.values()],relationships:[...relationships.values()],completeNeighborhood:false}:undefined})
  if(page.nextEdgeOffset!=null){if(!Number.isSafeInteger(page.nextEdgeOffset)||page.nextEdgeOffset<=edgeOffset)throw Error('Transaction pagination did not advance. Retry loading the network.');evidence.push({offset,edgeOffset:page.nextEdgeOffset})}
  return page
 }
 let offset=0
 for(;;){
  const page=await read(offset,0)
  if(page.nextOffset==null)break
  if(!Number.isSafeInteger(page.nextOffset)||page.nextOffset<=offset)throw Error('Organization pagination did not advance. Retry loading the network.')
  offset=page.nextOffset
 }
 // Each batch can add continuation cursors; keep them behind other pending pages.
 while(evidence.length){const batch=evidence.splice(0,2);await Promise.all(batch.map(({offset,edgeOffset})=>read(offset,edgeOffset)))}
 if(Number.isFinite(first.total)&&organizations.size<first.total)throw Error('The neighborhood ended before all organizations were loaded. Retry loading the network.')
 return {...first,matchingEdges:relationships.size,organizations:[...organizations.values()],relationships:[...relationships.values()],offset:0,edgeOffset:0,nextOffset:null,nextEdgeOffset:null,truncated:false,completeNeighborhood:true}
}
