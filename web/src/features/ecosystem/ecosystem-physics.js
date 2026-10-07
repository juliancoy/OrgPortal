import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from 'd3-force'

// Compare documented USD awards only; aggregate/context records are not transfers.
export function financialPull(edge) {
 const usd=edge.currency==='USD'||(!edge.currency&&/^\$/.test(edge.amountLabel||''))
 return edge.kind==='transfer'&&usd&&Number.isFinite(edge.amount)&&edge.amount>0
  ? Math.log1p(edge.amount/1000)/Math.log(10) : 0
}

export function layoutNetwork(nodes, edges, radius, center, { live = false, attraction = 1, repulsion = 1 } = {}) {
 const byId=new Map(nodes.map(n=>[n.id,n])), pairs=new Map()
 for(const edge of edges) {
  const a=typeof edge.source==='object'?edge.source.id:edge.source,b=typeof edge.target==='object'?edge.target.id:edge.target
  edge.source=byId.get(a);edge.target=byId.get(b)
  if(a===b)continue
  const key=JSON.stringify([a,b].sort()),pull=financialPull(edge),old=pairs.get(key)
  // Parallel reports must not multiply the physical attraction.
  if(!old||pull>old.pull)pairs.set(key,{source:a,target:b,pull})
 }
 const links=[...pairs.values()]
 const gravity=alpha=>{
  for(const link of links) {
   if(!link.pull||!attraction)continue
   const a=link.source,b=link.target,dx=b.x-a.x,dy=b.y-a.y
   const softening=radius(a)+radius(b)+40
   const distance=Math.sqrt(dx*dx+dy*dy+softening*softening)
   const impulse=Math.min(2,1600*link.pull/(distance*distance))*alpha*attraction
   a.vx+=dx/distance*impulse;a.vy+=dy/distance*impulse
   b.vx-=dx/distance*impulse;b.vy-=dy/distance*impulse
  }
 }
 const simulation=forceSimulation(nodes).stop().velocityDecay(.45)
  .force('link',forceLink(links).id(n=>n.id)
   .distance(e=>radius(e.source)+radius(e.target)+24+90/(1+e.pull))
   .strength(e=>Math.min(.9,attraction*(.08+.5*e.pull/(1+e.pull)))))
  .force('gravity',gravity)
  // Larger rendered area acts as gravitational mass; repulsion is local.
  .force('attraction',forceManyBody().strength(n=>12*attraction*(radius(n)/10)**2).distanceMin(80))
  .force('charge',forceManyBody().strength(-80*repulsion).distanceMin(30).distanceMax(180))
  .force('x',forceX(0).strength(.012*attraction))
  .force('y',forceY(0).strength(.012*attraction))
  .force('collision',forceCollide(n=>radius(n)+12).strength(1).iterations(6))
 // Live callers own the clock: no independent D3 timer or blocking layout pass.
 if(live)return simulation.alpha(.35).alphaDecay(.012)
 // Fixed integration steps, independent of display refresh rate. Cool to rest.
 for(let i=0;i<360;i++)simulation.tick()
 // D3 collision is a soft velocity constraint. Project remaining penetrations
 // after integration so no rendered circle can overlap, even in dense hubs.
 for(let pass=0;pass<200;pass++) {
  let overlap=false
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++) {
   const a=nodes[i],b=nodes[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),minimum=radius(a)+radius(b)+12
   if(d>=minimum-.001)continue
   overlap=true
   const ux=d?dx/d:1,uy=d?dy/d:0,shift=(minimum-d+.002)/2
   a.x-=ux*shift;a.y-=uy*shift;b.x+=ux*shift;b.y+=uy*shift
  }
  if(!overlap)break
 }
 nodes.forEach(n=>{n.vx=0;n.vy=0})
 return nodes
}
