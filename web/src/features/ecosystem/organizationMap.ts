export type MapNode={id:string;name:string;slug:string|null;category:string;type?:string;financialAmount?:number|null;receivedUsd?:number|null}
export type MapEdge={id:string;source:string;target:string;recordCount:number;kinds:string[];hierarchy?:boolean}
export type MapPage={parentDepth?:number;childDepth?:number;version:string;generatedAt:string;fy?:string;fiscalYears?:number[];financialTotals?:{currencies:{currency:string;received:number;disbursed:number}[];missingAmounts:number};anchor:string|null;hiddenParent?:MapNode|null;organizations:MapNode[];relationships:MapEdge[];total:number;incoming:number;outgoing:number;offset:number;nextOffset:number|null}
export async function loadOrganizationMap(fetchPage:(offset:number,version?:string)=>Promise<MapPage>,progress:(loaded:number,total:number)=>void=()=>{},preview:(data:MapPage)=>void=()=>{}) {
 const nodes=new Map<string,MapNode>(),edges=new Map<string,MapEdge>();let first:MapPage|undefined,offset=0
 for(;;){
  const page=await fetchPage(offset,first?.version)
  if(!Array.isArray(page.organizations)||!Array.isArray(page.relationships)||!Number.isSafeInteger(page.total)||page.total<0)throw Error('Incomplete organization map response')
  if(!first)first=page
  if(page.version!==first.version||page.anchor!==first.anchor||page.total!==first.total||(page.parentDepth??1)!==(first.parentDepth??1)||(page.childDepth??1)!==(first.childDepth??1))throw Error('The map changed while loading. Retry to load one consistent snapshot.')
  for(const node of page.organizations)nodes.set(node.id,node)
  for(const edge of page.relationships)edges.set(edge.id,edge)
  if(page.anchor&&!nodes.has(page.anchor)||[...edges.values()].some(edge=>!nodes.has(edge.source)||!nodes.has(edge.target)||((page.parentDepth??1)===1&&(page.childDepth??1)===1&&edge.source!==page.anchor&&edge.target!==page.anchor)))throw Error('Invalid organization relationship')
  progress(Math.max(0,nodes.size-(page.anchor?1:0)),page.total)
  if(page.nextOffset===null)break
  if(!Number.isSafeInteger(page.nextOffset)||page.nextOffset<=offset)throw Error('The organization map did not finish loading. Retry.')
  // Render one validated preview while subsequent pages arrive. Updating only
  // once more at completion avoids restarting layout for every page.
  if(offset===0)preview({...page,organizations:[...nodes.values()],relationships:[...edges.values()]})
  offset=page.nextOffset
 }
 if(first.anchor&&(!nodes.has(first.anchor)||nodes.size!==first.total+1))throw Error('Some adjacent organizations are missing. Retry.')
 if([...edges.values()].some(edge=>!nodes.has(edge.source)||!nodes.has(edge.target)||((first.parentDepth??1)===1&&(first.childDepth??1)===1&&edge.source!==first.anchor&&edge.target!==first.anchor)))throw Error('Invalid organization relationship')
 return {...first,organizations:[...nodes.values()],relationships:[...edges.values()],nextOffset:null}
}
export type PositionedNode=MapNode&{x:number;y:number;z:number;renderRadius:number;opacity:number;volumeColor?:number;sphereTitle?:string;sphereSubtitle?:string;direction:'focus'|'incoming'|'outgoing'|'both'}
// A fixed USD scale keeps the same organization the same size across neighborhoods.
// Logarithmic radii keep small transfers visible beside billion-dollar agencies.
// Zooming out applies one visibility multiplier to every node, preserving ratios.
export function organizationNodeRadius(amount:number|null|undefined,screenScale=1):number {
 const radius=typeof amount==='number'&&Number.isFinite(amount)&&amount>0?3+2*Math.log10(1+amount/1000):3
 return radius*(Number.isFinite(screenScale)&&screenScale>0?Math.max(1,.5/screenScale):1)
}
const financialMass=(node:MapNode)=>Number.isFinite(node.financialAmount)&&node.financialAmount!>0?Math.log10(1+node.financialAmount!/1000):0
export function organizationMapLayout(data:MapPage,mode:'2d'|'3d'='2d',options:{groupAttraction?:number}={}):PositionedNode[] {
 const reached=(upstream:boolean,levels:number)=>{
  const adjacency=new Map<string,string[]>()
  for(const edge of data.relationships){const from=upstream?edge.target:edge.source,to=upstream?edge.source:edge.target;const list=adjacency.get(from)||[];list.push(to);adjacency.set(from,list)}
  const visited=new Set<string>(data.anchor?[data.anchor]:[]);let frontier=data.anchor?[data.anchor]:[]
  for(let level=0;level<levels&&frontier.length;level++){const next:string[]=[];for(const id of frontier)for(const neighbor of adjacency.get(id)||[])if(!visited.has(neighbor)){visited.add(neighbor);next.push(neighbor)};frontier=next}
  if(data.anchor)visited.delete(data.anchor);return visited
 }
 const incoming=reached(true,data.parentDepth??1),outgoing=reached(false,data.childDepth??1)
 const anchor=data.organizations.find(n=>n.id===data.anchor),nodes:PositionedNode[]=anchor?[{...anchor,x:0,y:0,z:0,renderRadius:organizationNodeRadius(anchor.financialAmount),opacity:1,direction:'focus'}]:[]
 const mass=financialMass
 const neighbors=data.organizations.filter(n=>n.id!==data.anchor).sort((a,b)=>mass(b)-mass(a)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id))
 const maximumMass=Math.max(1,...neighbors.map(mass))
 // Direction belongs to the arrows, not to a preferred side of the anchor.
 // Grow capacity with circumference/surface area to keep larger maps readable.
 const goldenAngle=Math.PI*(3-Math.sqrt(5))
 for(let start=0,shell=0;start<neighbors.length;shell++){
  const capacity=mode==='3d'?48*(shell+1)**2:18*(shell+1),count=Math.min(capacity,neighbors.length-start),radius=170+shell*75
  for(let i=0;i<count;i++){
   const node=neighbors[start+i],direction=incoming.has(node.id)?outgoing.has(node.id)?'both':'incoming':'outgoing'
   // Larger financial volumes settle into inner shells and feel a stronger
   // central pull. Bound contraction by the space required for their markers.
   const marker=organizationNodeRadius(node.financialAmount),spacing=2*marker+12
   // Spatial nodes can occupy a volume, rather than all sharing a sphere's
   // surface. Surface packing was pushing the biggest markers back outward.
   const packingRadius=mode==='3d'?Math.cbrt(count)*spacing/2:count*spacing/(2*Math.PI)
   const orbit=Math.max((nodes[0]?.renderRadius||3)+marker+24,packingRadius,radius*(1-(mode==='3d'?.65:.35)*mass(node)/maximumMass))
   let x:number,y:number,z=0
   if(mode==='3d'&&count>3){
    // Equal-area Fibonacci sampling covers both hemispheres without polar clumps.
    const vertical=1-2*(i+.5)/count,radial=Math.sqrt(1-vertical*vertical),angle=i*goldenAngle+shell*goldenAngle
    x=orbit*radial*Math.cos(angle);y=orbit*vertical;z=orbit*radial*Math.sin(angle)
   }else{
    const angle=2*Math.PI*i/count+shell*goldenAngle
    x=orbit*Math.cos(angle);y=orbit*Math.sin(angle)
   }
   nodes.push({...node,x,y,z,renderRadius:organizationNodeRadius(node.financialAmount),opacity:1,direction})
  }
  start+=count
 }
 const attraction=options.groupAttraction??.12
 if(Number.isFinite(attraction)&&attraction>0)attractDirectionGroups(nodes,mode,Math.min(attraction,.25))
 return nodes
}

function attractDirectionGroups(nodes:PositionedNode[],mode:'2d'|'3d',strength:number){
 const neighbors=nodes.filter(n=>n.direction!=='focus')
 const upstream=neighbors.filter(n=>n.direction!=='outgoing'),downstream=neighbors.filter(n=>n.direction!=='incoming')
 const grouped=!!upstream.length&&!!downstream.length&&!(upstream.length===neighbors.length&&downstream.length===neighbors.length)
 const spatialGravity=mode==='3d'&&neighbors.some(n=>financialMass(n)>0)
 // A single direction needs no angular clustering, but financial gravity and
 // collision relaxation must still run for an all-recipient 3D neighborhood.
 if(!grouped&&!spatialGravity)return
 const maximumMass=Math.max(1,...neighbors.map(financialMass)),anchorRadius=nodes.find(n=>n.direction==='focus')?.renderRadius||3
 const radii=new Map(neighbors.map(n=>[n,Math.hypot(n.x,n.y,n.z)]))
 type Vector={x:number;y:number;z:number}
 const mean=(group:PositionedNode[]):Vector=>{
  if(!group.length)return {x:0,y:0,z:0}
  const sum={x:0,y:0,z:0}
  for(const n of group){const radius=Math.hypot(n.x,n.y,n.z);sum.x+=n.x/radius;sum.y+=n.y/radius;sum.z+=n.z/radius}
  return {x:sum.x/group.length,y:sum.y/group.length,z:sum.z/group.length}
 }
 // Small deterministic radial offsets let interleaved peers pass each other.
 if(grouped)neighbors.forEach((n,i)=>{const scale=1+.04*Math.sin(i*2.399963);n.x*=scale;n.y*=scale;n.z*=scale})
 const separation=Math.max(32,2*Math.max(...neighbors.map(n=>n.renderRadius))+(spatialGravity?8:6)),ticks=spatialGravity?400:320
 // Every step moves at most 8 units. This bound makes numeric grid keys unique
 // throughout relaxation, avoiding millions of short-lived string keys.
 const cells=Math.ceil((Math.max(...radii.values())*1.04+8*ticks+110)/separation)+2,span=2*cells+1
 const key=(x:number,y:number,z:number)=>((x+cells)*span+y+cells)*span+z+cells
 const grid=new Map<number,number>(),links=new Int32Array(neighbors.length),next=new Float64Array(neighbors.length*3)
 // Bounded relaxation happens once at load; camera interaction stays independent.
 // Group centroids replace all-to-all springs, and a spatial grid limits collisions.
 for(let tick=0;tick<ticks;tick++){
  const all=mean(neighbors),up=mean(upstream),down=mean(downstream)
  if(grouped&&tick===0&&Math.hypot(up.x-down.x,up.y-down.y,up.z-down.z)<.02){
   // Break perfectly symmetric starting layouts using a member's position,
   // never a fixed left/right axis. Reciprocal nodes feel both groups.
   const seed=upstream.find(n=>n.direction==='incoming')||upstream[0],radius=radii.get(seed)!
   for(const axis of ['x','y','z'] as const){up[axis]+=.02*seed[axis]/radius;down[axis]-=.02*seed[axis]/radius}
  }
  grid.clear()
  // Reverse insertion preserves the original collision traversal order.
  for(let i=neighbors.length-1;i>=0;i--){const n=neighbors[i],cell=key(Math.floor(n.x/separation),Math.floor(n.y/separation),Math.floor(n.z/separation));links[i]=grid.get(cell)??-1;grid.set(cell,i)}
  neighbors.forEach((n,i)=>{
   const radius=Math.hypot(n.x,n.y,n.z),rest=radii.get(n)!,ux=n.x/radius,uy=n.y/radius,uz=n.z/radius
   const center=n.direction==='incoming'?up:n.direction==='outgoing'?down:{x:(up.x+down.x)/2,y:(up.y+down.y)/2,z:(up.z+down.z)/2}
   // Let angular grouping settle before the final collision/gravity steps, so
   // dense directional clusters cannot keep pressing small spheres together.
   const angularStrength=grouped?strength*(spatialGravity?Math.max(0,Math.min(1,(320-tick)/80)):1):0,weight=spatialGravity?financialMass(n)/maximumMass:0
   let dx=(center.x-all.x)*radius*angularStrength,dy=(center.y-all.y)*radius*angularStrength,dz=(center.z-all.z)*radius*angularStrength
   const radial=dx*ux+dy*uy+dz*uz,restore=(rest-radius)*(.04+.12*weight)
   dx+=(restore-radial)*ux;dy+=(restore-radial)*uy;dz+=(restore-radial)*uz
   const cx=Math.floor(n.x/separation),cy=Math.floor(n.y/separation),cz=Math.floor(n.z/separation)
   for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++)for(let z=cz-(mode==='3d'?1:0);z<=cz+(mode==='3d'?1:0);z++){
    for(let index=grid.get(key(x,y,z))??-1;index!==-1;index=links[index]){
     const other=neighbors[index]
     if(other===n)continue
     const x=n.x-other.x,y=n.y-other.y,z=n.z-other.z,distance=Math.hypot(x,y,z)
     const clearance=spatialGravity?n.renderRadius+other.renderRadius+8:separation
     if(distance>0&&distance<clearance){const push=(clearance-distance)*2/distance;dx+=x*push;dy+=y*push;dz+=z*push}
    }
   }
   // Attraction acts around the anchor; a soft radial spring and collision
   // repulsion let neighbors pass each other while retaining readable spacing.
   const minimumRadius=weight>0?anchorRadius+n.renderRadius+16:110
   const step=Math.min(1,8/(Math.hypot(dx,dy,dz)||1)),x=n.x+dx*step,y=n.y+dy*step,z=mode==='3d'?n.z+dz*step:0,scale=Math.max(minimumRadius,Math.hypot(x,y,z))/Math.hypot(x,y,z)
   next[i*3]=x*scale;next[i*3+1]=y*scale;next[i*3+2]=z*scale
  })
  neighbors.forEach((n,i)=>{n.x=next[i*3];n.y=next[i*3+1];n.z=next[i*3+2]})
 }
}
