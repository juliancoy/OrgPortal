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
   const key=`${Math.floor(node.x/cellSize)},${Math.floor(node.y/cellSize)}`
   if(!grid.has(key))grid.set(key,[])
   grid.get(key).push(node)
  }
  const padding=Math.max(0,...nodes.map(radius))+16
  for(const {source:a,target:b} of links) {
   const dx=b.x-a.x,dy=b.y-a.y,lengthSquared=dx*dx+dy*dy
   if(lengthSquared<1e-6)continue
   const length=Math.sqrt(lengthSquared)
   for(let x=Math.floor((Math.min(a.x,b.x)-padding)/cellSize);x<=Math.floor((Math.max(a.x,b.x)+padding)/cellSize);x++)
    for(let y=Math.floor((Math.min(a.y,b.y)-padding)/cellSize);y<=Math.floor((Math.max(a.y,b.y)+padding)/cellSize);y++)
     for(const node of grid.get(`${x},${y}`)||[]) {
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

// Refresh spatially filtered crossings every six ticks; pull children closer.
export function forceCrossingAttraction(links,radius) {
 let tick=0,crossing=new Set()
 const side=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x)
 return alpha=>{
  if(tick++%6===0) {
   crossing=new Set()
   const grid=new Map(),checked=new Set(),cellSize=150
   links.forEach((link,i)=>{
    const a=link.source,b=link.target
    for(let x=Math.floor(Math.min(a.x,b.x)/cellSize);x<=Math.floor(Math.max(a.x,b.x)/cellSize);x++)
     for(let y=Math.floor(Math.min(a.y,b.y)/cellSize);y<=Math.floor(Math.max(a.y,b.y)/cellSize);y++) {
      const key=`${x},${y}`,bucket=grid.get(key)||[]
      for(const j of bucket) {
       const pair=`${j},${i}`
       if(checked.has(pair))continue
       checked.add(pair)
       const c=links[j].source,d=links[j].target
       if(a===c||a===d||b===c||b===d)continue
       if(side(a,b,c)*side(a,b,d)<0&&side(c,d,a)*side(c,d,b)<0){crossing.add(link);crossing.add(links[j])}
      }
      bucket.push(i);grid.set(key,bucket)
     }
   })
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

export function layoutNetwork(nodes, edges, radius, center, { live = false } = {}) {
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
   if(!link.pull)continue
   const a=link.source,b=link.target,dx=b.x-a.x,dy=b.y-a.y
   const softening=radius(a)+radius(b)+40
   const distance=Math.sqrt(dx*dx+dy*dy+softening*softening)
   const impulse=Math.min(2,1600*link.pull/(distance*distance))*alpha
   a.vx+=dx/distance*impulse;a.vy+=dy/distance*impulse
   b.vx-=dx/distance*impulse;b.vy-=dy/distance*impulse
  }
 }
 const simulation=forceSimulation(nodes).stop().velocityDecay(.45)
  .force('link',forceLink(links).id(n=>n.id)
   .distance(e=>radius(e.source)+radius(e.target)+24+90/(1+e.pull))
   .strength(e=>.08+.5*e.pull/(1+e.pull)))
  .force('gravity',gravity)
  .force('crossings',forceCrossingAttraction(links,radius))
  .force('edgeClearance',forceNodeEdgeRepulsion(nodes,links,radius))
  .force('charge',forceManyBody().strength(-220).distanceMin(30))
  .force('x',forceX(n=>center(n).x).strength(.035))
  .force('y',forceY(n=>center(n).y).strength(.035))
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
