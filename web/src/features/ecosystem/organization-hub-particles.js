import {forceSimulation,forceLink,forceManyBody,forceCollide,forceX,forceY,forceZ} from 'd3-force-3d'

// A shortest-path spanning forest provides layout guides only. Every real edge
// remains visible, including shared children, reciprocal links and cycles.
export function settleOrganizationHubs(nodes,edges,anchor,dimensions=2,spacing=1){
 if(!nodes.length)return nodes
 spacing=[.8,1,1.5].includes(spacing)?spacing:1
 const ordered=[...nodes].sort((a,b)=>a.id.localeCompare(b.id)),byId=new Map(ordered.map(n=>[n.id,n]))
 const adjacency=new Map(ordered.map(n=>[n.id,new Set()])),pairs=new Map()
 for(const edge of edges){
  if(edge.source===edge.target||!byId.has(edge.source)||!byId.has(edge.target))continue
  adjacency.get(edge.source).add(edge.target);adjacency.get(edge.target).add(edge.source)
  const ids=[edge.source,edge.target].sort(),key=JSON.stringify(ids)
  if(!pairs.has(key))pairs.set(key,{source:ids[0],target:ids[1]})
 }
 const root=byId.get(anchor)||ordered[0],parent=new Map([[root.id,null]]),children=new Map(ordered.map(n=>[n.id,[]])),queue=[root.id]
 // Prefer a more connected hub for equal-length paths; stable IDs break ties.
 const compare=(a,b)=>adjacency.get(b).size-adjacency.get(a).size||a.localeCompare(b)
 for(let head=0;head<queue.length;head++){
  const id=queue[head]
  for(const next of [...adjacency.get(id)].sort(compare))if(!parent.has(next)){parent.set(next,id);children.get(id).push(next);queue.push(next)}
 }
 // Defensive handling for partial/disconnected snapshots without losing nodes.
 for(const n of ordered)if(!parent.has(n.id)){parent.set(n.id,root.id);children.get(root.id).push(n.id);queue.push(n.id)}
 const bounds=new Map(),rings=new Map()
 for(const id of [...queue].reverse()){
  const kids=children.get(id),marker=byId.get(id).renderRadius+18
  const largest=Math.max(0,...kids.map(k=>bounds.get(k))),sum=kids.reduce((s,k)=>s+bounds.get(k),0)
  const ring=kids.length?Math.max(marker+largest+30,largest*2,sum/Math.PI)*spacing:0
  rings.set(id,ring);bounds.set(id,Math.max(marker,ring+largest))
 }
 root.x=0;root.y=0;root.z=0
 const golden=Math.PI*(3-Math.sqrt(5))
 for(const id of queue){
  const n=byId.get(id),kids=children.get(id).sort(compare),radius=rings.get(id)
  kids.forEach((child,i)=>{
   const angle=2*Math.PI*i/kids.length+(parent.get(id)?golden:0),vertical=dimensions===3&&kids.length>2?1-2*(i+.5)/kids.length:0
   const a=dimensions===3&&kids.length>2?i*golden:angle,r=Math.sqrt(1-vertical*vertical),target=byId.get(child)
   target.x=n.x+radius*r*Math.cos(a);target.y=n.y+radius*(dimensions===3?vertical:Math.sin(a));target.z=dimensions===3?n.z+radius*r*Math.sin(a):0
  })
 }
 const guides=new Map(ordered.map(n=>[n.id,{x:n.x,y:n.y,z:n.z}]))
 const links=[...pairs.values()].sort((a,b)=>a.source.localeCompare(b.source)||a.target.localeCompare(b.target)).map(link=>{
  const p=parent.get(link.source)===link.target?link.target:parent.get(link.target)===link.source?link.source:null
  return {...link,tree:!!p,length:p?rings.get(p):80*spacing}
 })
 root.fx=0;root.fy=0;if(dimensions===3)root.fz=0
 // Barnes–Hut repulsion and collision trees keep this subquadratic. Stronger
 // hub repulsion, branch springs and local guides prevent a central hairball.
 const simulation=forceSimulation(ordered,dimensions).stop().velocityDecay(.5).alphaDecay(.025)
  .force('links',forceLink(links).id(n=>n.id).distance(e=>e.length).strength(e=>e.tree?.3:.015))
  .force('charge',forceManyBody().strength(n=>-55*spacing*(1+Math.sqrt(children.get(n.id).length))).distanceMax(600*spacing))
  .force('collision',forceCollide(n=>n.renderRadius+14).iterations(2))
  .force('x',forceX(n=>guides.get(n.id).x).strength(.12))
  .force('y',forceY(n=>guides.get(n.id).y).strength(.12))
 if(dimensions===3)simulation.force('z',forceZ(n=>guides.get(n.id).z).strength(.12))
 // Settle once in the layout worker; no background physics after convergence.
 simulation.tick(260);simulation.stop()
 for(const n of ordered){n.hubChildren=children.get(n.id).length;delete n.fx;delete n.fy;delete n.fz;delete n.vx;delete n.vy;delete n.vz;delete n.index;if(dimensions===2)n.z=0}
 // Reserve label priority for branch junctions before their leaf nodes.
 return nodes.sort((a,b)=>(a.id===root.id?-1:b.id===root.id?1:children.get(b.id).length-children.get(a.id).length||a.id.localeCompare(b.id)))
}
