import {forceSimulation,forceLink,forceManyBody,forceCollide,forceX,forceY,forceZ} from 'd3-force-3d'
import {financialPull} from './ecosystem-physics.js'
export function layoutNetwork3D(nodes,edges,{attraction=1,repulsion=1,proximity=1,centralGravity=0,dither=0}={}){
 const pairs=new Map(),size=n=>n.renderRadius
 for(const edge of edges){
  if(edge.source===edge.target)continue
  const key=JSON.stringify([edge.source,edge.target].sort()),pull=financialPull(edge),support=['transfer','incubation','acceleration','mentoring','services','in_kind'].includes(edge.kind),old=pairs.get(key)
  if(old){old.pull=Math.max(old.pull,pull);old.support ||= support}else pairs.set(key,{source:edge.source,target:edge.target,pull,support})
 }
 const sim=forceSimulation(nodes,3).stop().velocityDecay(.45)
 const gravity=n=>.006*centralGravity*(size(n)/10)**2
 let random=()=>.5
 const current=alpha=>{const amplitude=.7*dither*Math.sqrt(alpha);if(!amplitude)return;for(const n of nodes)for(const axis of ['x','y','z'])if(n['f'+axis]==null)n['v'+axis]+=(random()*2-1)*amplitude}
 current.initialize=(_nodes,source)=>{random=source}
 return sim.force('link',forceLink([...pairs.values()]).id(n=>n.id).distance(e=>size(e.source)+size(e.target)+(e.support?18+30/(1+e.pull):70)).strength(e=>Math.min(.9,e.support?proximity*(.55+.2*e.pull/(1+e.pull)):attraction*.08)))
  .force('attraction',forceManyBody().strength(n=>12*attraction*(size(n)/10)**2).distanceMin(80))
  .force('charge',forceManyBody().strength(-80*repulsion).distanceMin(30).distanceMax(180))
  .force('x',forceX(0).strength(gravity)).force('y',forceY(0).strength(gravity)).force('z',forceZ(0).strength(gravity))
  .force('collision',forceCollide(n=>size(n)+12).strength(1).iterations(2)).force('dither',current)
  .alpha(.35).alphaDecay(.025).alphaTarget(dither>0?.04:0)
}
