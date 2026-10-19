import {createPositionTransition} from './position-transition.js'
import {createPositionQueue} from './frame-budget.js'
import {initializeNetworkPositions} from './network-initial-positions.js'
import {createProjectionFrame,projectNetworkPoint,projectionMovement} from './network-projection.js'
import {createNetworkND} from './particle-life-4d.js'
// Keep layout integration off the UI thread; terminate old graphs on rebuild.
export function createNetworkLayout(nodes, edges, options, enabled, changed) {
 const four=options.dimensions>=4,spatial=options.dimensions>=3
 let settings={algorithm:'perspective',displayDimensions:3,angles:[],perspective:.35,camera:[]},projectionFrame
 const extent=Math.max(180,90*Math.pow(nodes.length,1/options.dimensions)),stride=options.dimensions*2
 const project=(items=nodes)=>{if(four)items.forEach(n=>{if(n.q){const point=projectNetworkPoint(n.q,projectionFrame,{...settings,extent});n.clipped4D=!point;[n.x,n.y,n.z]=point||[0,0,0]}})}
 initializeNetworkPositions(nodes,options.dimensions)
 const byId=new Map(nodes.map(node=>[node.id,node]))
 if(four){createNetworkND(nodes,edges,options);projectionFrame=createProjectionFrame(nodes.map(n=>n.q),options.dimensions);project()}
 const links=edges.map(edge=>{
  const source=edge.source?.id||edge.source,target=edge.target?.id||edge.target
  edge.source=byId.get(source);edge.target=byId.get(target)
  return {source,target,kind:edge.kind,currency:edge.currency,amount:edge.amount,amountLabel:edge.amountLabel}
 })
 const worker=four?new Worker(new URL('./network-layout-4d.worker.js',import.meta.url),{type:'module'}):spatial?new Worker(new URL('./network-layout-3d.worker.js',import.meta.url),{type:'module'}):new Worker(new URL('./network-layout.worker.js',import.meta.url),{type:'module'})
 const queue=createPositionQueue(),projectionQueue=createPositionQueue(),transition=spatial&&!four?createPositionTransition(nodes):null
 worker.onmessage=({data})=>{if(transition)transition.offer(data);else queue.offer(data,nodes.length);changed(false)}
 const consume=budget=>{
  if(transition)return transition.consume()
  const projectionIndices=projectionQueue.take(nodes.length,budget,()=>{})
  const indices=queue.take(nodes.length,budget-projectionIndices.length,(data,i)=>{const node=nodes[i];if(four){node.q=Array.from(data.subarray(i*stride,i*stride+options.dimensions));node.velocityND=Array.from(data.subarray(i*stride+options.dimensions,(i+1)*stride))}else if(spatial)[node.x,node.y,node.z,node.vx,node.vy,node.vz]=data.subarray(i*6,i*6+6);else [node.x,node.y,node.vx,node.vy]=data.subarray(i*4,i*4+4)})
  indices.push(...projectionIndices)
  const updated=[...new Set(indices)].map(i=>nodes[i]);project(updated);return new Set(updated.map(n=>n.id))
 }
 worker.postMessage({type:'graph',nodes:nodes.map(({id,category,q,velocityND,x,y,z,vx,vy,vz,renderRadius})=>({id,category,q,velocityND,x,y,z,vx,vy,vz,renderRadius})),edges:links,options,enabled})
 return {consume,projectionPending:()=>projectionQueue.pending(),pending:()=>transition?transition.pending():queue.pending()||projectionQueue.pending(),movement(delta,sliceAxis){return projectionMovement(delta,projectionFrame,{...settings,sliceAxis})},axisPosition(position,sliceAxis){const axis=projectionMovement([0,0,0,1],projectionFrame,{...settings,sliceAxis});return axis.reduce((sum,v,i)=>sum+v*(position[i]??0),0)},projection(nextAngles,nextPerspective,nextCamera=[],next={}){
 const refit=next.refit||next.algorithm!==settings.algorithm||next.seed!==settings.seed
 settings={...settings,...next,angles:nextAngles,perspective:nextPerspective,camera:[...nextCamera]}
 if(refit)projectionFrame=createProjectionFrame(nodes.map(n=>n.q),options.dimensions,settings.algorithm,settings.seed)
 projectionQueue.offer([],nodes.length);changed(false)
 },stop(){worker.terminate()},motion(enabled,reheat=false){worker.postMessage({type:'motion',enabled,reheat})}}
}
