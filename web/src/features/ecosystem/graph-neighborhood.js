// Follow indexed, stored relationship directions; no hierarchy is inferred.
export function graphNeighborhood(topology,selected,depth,direction='both'){
 if(!['both','parents','children'].includes(direction))throw Error('Invalid graph direction')
 const nodeId=value=>typeof value==='number'?topology.nodeIds[value]:value
 const distances=new Map([[selected,0]]),nodes=new Set([selected]),edges=direction==='both'?null:new Set()
 let frontier=[selected]
 for(let hop=0;hop<depth;hop++){
  const next=[]
  for(const id of frontier){
   const neighbors=direction==='both'?(topology.adjacency[id]||[]).map(value=>[nodeId(value),null]):(topology.edgesByOrg[id]||[]).flatMap(index=>{
    const edge=topology.edges[index],source=nodeId(edge[0]),target=nodeId(edge[1])
    return source===target?[]:direction==='parents'?(target===id?[[source,index]]:[]):source===id?[[target,index]]:[]
   })
   for(const [neighbor,index] of neighbors){
    if(neighbor===selected)continue
    edges?.add(index)
    if(!nodes.has(neighbor)){nodes.add(neighbor);distances.set(neighbor,hop+1);next.push(neighbor)}
   }
  }
  frontier=next
 }
 return {nodes,edges,distances}
}
