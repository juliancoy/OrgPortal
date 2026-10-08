import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from 'd3-force'

// Canonical pairing keeps reverse-direction reports in the same curve bundle.
export function assignEdgeCurvature(edges) {
 const pairs=new Map()
 for(const edge of edges) {
  const a=typeof edge.source==='object'?edge.source.id:edge.source
  const b=typeof edge.target==='object'?edge.target.id:edge.target
  const key=JSON.stringify([a,b].sort())
  if(!pairs.has(key))pairs.set(key,[])
  pairs.get(key).push({edge,direction:a<b?1:-1})
 }
 for(const bundle of pairs.values()) {
  bundle.sort((a,b)=>String(a.edge.id).localeCompare(String(b.edge.id)))
  bundle.forEach(({edge,direction},i)=>{edge.curveOffset=(i-(bundle.length-1)/2)*18*direction})
 }
}

// Use a spatial grid so unrelated node/segment checks stay local.
export function forceNodeEdgeRepulsion(nodes, links, radius) {
 return alpha=>{
  const cellSize=100, grid=new Map()
  for(const node of nodes) {
   const x=Math.floor(node.x/cellSize),y=Math.floor(node.y/cellSize),key=`${x},${y}`
   if(!grid.has(key))grid.set(key,{x,y,nodes:[]})
   grid.get(key).nodes.push(node)
  }
  const padding=Math.max(0,...nodes.map(radius))+16
  for(const {source:a,target:b} of links) {
   const dx=b.x-a.x,dy=b.y-a.y,lengthSquared=dx*dx+dy*dy
   if(lengthSquared<1e-6)continue
   const length=Math.sqrt(lengthSquared)
   const minX=Math.floor((Math.min(a.x,b.x)-padding)/cellSize),maxX=Math.floor((Math.max(a.x,b.x)+padding)/cellSize)
   const minY=Math.floor((Math.min(a.y,b.y)-padding)/cellSize),maxY=Math.floor((Math.max(a.y,b.y)+padding)/cellSize)
   // Scan occupied cells only. A long edge must not walk millions of empty cells.
   for(const {x,y,nodes:bucket} of grid.values()) {
    if(x<minX||x>maxX||y<minY||y>maxY)continue
    for(const node of bucket) {
      if(node===a||node===b)continue
      const t=((node.x-a.x)*dx+(node.y-a.y)*dy)/lengthSquared
      if(t<=0||t>=1)continue
      const px=node.x-(a.x+t*dx),py=node.y-(a.y+t*dy),distance=Math.hypot(px,py),clearance=radius(node)+16
      if(distance>=clearance)continue
      // A deterministic normal also separates nodes exactly on a segment.
      const ux=distance>1e-6?px/distance:-dy/length,uy=distance>1e-6?py/distance:dx/length
      const impulse=Math.min(1.5,(clearance-distance)*.08)*alpha
      const fx=ux*impulse,fy=uy*impulse
      node.vx+=fx;node.vy+=fy
      a.vx-=fx*(1-t);a.vy-=fy*(1-t)
      b.vx-=fx*t;b.vy-=fy*t
     }
   }
  }
 }
}

// Refresh spatially filtered crossings every six ticks; pull children closer.
export function forceCrossingAttraction(links,radius) {
 let tick=0,crossing=new Set()
 const side=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x)
 return alpha=>{
  if(tick++%6===0) {
   crossing=new Set()
   // Bounded by actual links, independent of the world-space length of edges.
   for(let i=0;i<links.length;i++)for(let j=0;j<i;j++) {
    const link=links[i],a=link.source,b=link.target,c=links[j].source,d=links[j].target
    if(a===c||a===d||b===c||b===d)continue
    if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)||Math.max(a.y,b.y)<Math.min(c.y,d.y)||Math.max(c.y,d.y)<Math.min(a.y,b.y))continue
    if(side(a,b,c)*side(a,b,d)<0&&side(c,d,a)*side(c,d,b)<0){crossing.add(link);crossing.add(links[j])}
   }
  }
  for(const {source:a,target:b} of crossing) {
   const dx=a.x-b.x,dy=a.y-b.y,distance=Math.hypot(dx,dy),gap=distance-radius(a)-radius(b)-24
   if(gap<=0)continue
   const impulse=Math.min(1.2,gap*.012)*alpha
   b.vx+=dx/distance*impulse;b.vy+=dy/distance*impulse
  }
 }
}

// Compare documented USD awards only; aggregate/context records are not transfers.
export function financialPull(edge) {
 const usd=edge.currency==='USD'||(!edge.currency&&/^\$/.test(edge.amountLabel||''))
 return edge.kind==='transfer'&&usd&&Number.isFinite(edge.amount)&&edge.amount>0
  ? Math.log1p(edge.amount/1000)/Math.log(10) : 0
}

export function layoutNetwork(nodes, edges, radius, center, { live = false, attraction = 1, repulsion = 1, proximity = 1 } = {}) {
 const radii=new Map(nodes.map(n=>[n.id,radius(n)])), size=n=>radii.get(n.id)
 const byId=new Map(nodes.map(n=>[n.id,n])), pairs=new Map()
 for(const edge of edges) {
  const a=typeof edge.source==='object'?edge.source.id:edge.source,b=typeof edge.target==='object'?edge.target.id:edge.target
  edge.source=byId.get(a);edge.target=byId.get(b)
  if(a===b)continue
  const key=JSON.stringify([a,b].sort()),pull=financialPull(edge),old=pairs.get(key)
  // Parallel reports must not multiply the physical attraction.
  const support=['transfer','incubation','acceleration','mentoring','services','in_kind'].includes(edge.kind)
  if(!old)pairs.set(key,{source:a,target:b,pull,support})
  else {old.pull=Math.max(old.pull,pull);old.support ||= support}
 }
 const links=[...pairs.values()]
 const simulation=forceSimulation(nodes).stop().velocityDecay(.45)
  .force('link',forceLink(links).id(n=>n.id)
   .distance(e=>size(e.source)+size(e.target)+(e.support?18+30/(1+e.pull):70))
   .strength(e=>Math.min(.9,e.support?proximity*(.55+.2*e.pull/(1+e.pull)):attraction*.08)))
  // Larger rendered area acts as gravitational mass; repulsion is local.
  .force('attraction',forceManyBody().strength(n=>12*attraction*(size(n)/10)**2).distanceMin(80))
  .force('charge',forceManyBody().strength(-80*repulsion).distanceMin(30).distanceMax(180))
  .force('x',forceX(0).strength(.012*attraction))
  .force('y',forceY(0).strength(.012*attraction))
  .force('collision',forceCollide(n=>size(n)+12).strength(1).iterations(live?2:6))
  .force('crossings',forceCrossingAttraction(links,size))
  .force('edgeClearance',forceNodeEdgeRepulsion(nodes,links,size))
 // Live callers own the clock: no independent D3 timer or blocking layout pass.
 if(live)return simulation.alpha(.35).alphaDecay(.025)
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
