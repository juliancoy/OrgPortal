// Keep layout integration off the UI thread; terminate old graphs on rebuild.
export function createNetworkLayout(nodes, edges, options, enabled, changed) {
 const byId = new Map(nodes.map((node, i) => {
  if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
   const radius=10*Math.sqrt(.5+i),angle=i*Math.PI*(3-Math.sqrt(5))
   node.x=radius*Math.cos(angle);node.y=radius*Math.sin(angle)
  }
  node.vx ||= 0;node.vy ||= 0
  return [node.id,node]
 }))
 const links=edges.map(edge=>{
  const source=edge.source?.id||edge.source,target=edge.target?.id||edge.target
  edge.source=byId.get(source);edge.target=byId.get(target)
  return {source,target,kind:edge.kind,currency:edge.currency,amount:edge.amount,amountLabel:edge.amountLabel}
 })
 const worker=new Worker(new URL('./network-layout.worker.js',import.meta.url),{type:'module'})
 worker.onmessage=({data})=>{
  nodes.forEach((node,i)=>{[node.x,node.y,node.vx,node.vy]=data.subarray(i*4,i*4+4)})
  changed()
 }
 worker.postMessage({type:'graph',nodes:nodes.map(({id,x,y,vx,vy,renderRadius})=>({id,x,y,vx,vy,renderRadius})),edges:links,options,enabled})
 return {stop(){worker.terminate()},motion(enabled,reheat=false){worker.postMessage({type:'motion',enabled,reheat})}}
}
