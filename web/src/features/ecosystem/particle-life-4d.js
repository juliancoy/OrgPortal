import {lawMagnitude} from './force-law.js'
// Plane rotations define three perpendicular viewing axes in N-space.
export function rotateND(vector,angles=[],inverse=false){
 const p=[...vector],planes=[]
 for(let hidden=3;hidden<p.length;hidden++)for(let axis=0;axis<3;axis++)planes.push([axis,hidden,angles[(hidden-3)*3+axis]??0])
 if(inverse)planes.reverse()
 for(const [axis,hidden,degrees] of planes){
  const a=degrees*Math.PI/180*(inverse?-1:1),c=Math.cos(a),s=Math.sin(a),v=p[axis]
  p[axis]=c*v-s*p[hidden];p[hidden]=s*v+c*p[hidden]
 }
 return p
}
export function projectND(q,angles=[],perspective=.35,extent=600,camera=[]){
 const p=rotateND(q.map((v,i)=>v-(camera[i]??0)),angles)
 const hidden=p.slice(3),depth=1-Math.max(0,Math.min(.8,perspective))*hidden.reduce((sum,v)=>sum+v,0)/(Math.sqrt(hidden.length||1)*extent*2.1)
 if(depth<=.05)return null
 return p.slice(0,3).map(v=>v/depth)
}
export function movementND(delta,angles=[]){return rotateND(delta,angles,true)}
export function createNetworkND(nodes,edges=[],options={}){
 const dimensions=options.dimensions??4
 if(!Number.isInteger(dimensions)||dimensions<4)throw new Error('Dimensions must be an integer of at least 4')
 const extent=options.extent??Math.max(180,90*Math.pow(nodes.length,1/dimensions)),radius=Math.max(50,Math.min(600,Number(options.lifeRadius)||300)),friction=Math.max(.1,Math.min(.98,Number(options.lifeFriction)||.85))
 const byId=new Map(nodes.map((n,i)=>[n.id,i])),pairs=new Map()
 for(const edge of edges){
  const a=byId.get(edge.source?.id??edge.source),b=byId.get(edge.target?.id??edge.target)
  if(a===undefined||b===undefined||a===b)continue
  const key=[Math.min(a,b),Math.max(a,b)].join(',')
  const support=['transfer','incubation','acceleration','mentoring','services','in_kind'].includes(edge.kind)
  const old=pairs.get(key)
  if(old)old.support ||= support
  else pairs.set(key,{a,b,support})
 }
 nodes.forEach((n,i)=>{
  if(!n.q?.every(Number.isFinite)||n.q.length!==dimensions){let state=Math.imul(i+1,2654435761)>>>0;n.q=Array.from({length:dimensions},()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return (state/4294967296*2-1)*extent*.8})}
  n.q=n.q.map(v=>Math.max(-extent,Math.min(extent,v)))
  if(!n.velocityND?.every(Number.isFinite)||n.velocityND.length!==dimensions)n.velocityND=Array(dimensions).fill(0)
 })
 let randomState=42
 const random=()=>{randomState=(Math.imul(1664525,randomState)+1013904223)>>>0;return randomState/4294967296-.5}
 return {extent,tick(){
  const acceleration=nodes.map(()=>Array(dimensions).fill(0))
  // Sweep one axis, then check full N-dimensional distance. No 3^N cells.
  const order=nodes.map((_,i)=>i).sort((a,b)=>nodes[a].q[0]-nodes[b].q[0])
  for(let a=0;a<order.length;a++)for(let b=a+1;b<order.length;b++){
   const i=order[a],j=order[b],left=nodes[i],right=nodes[j]
   if(right.q[0]-left.q[0]>=radius)break
   let square=0
   for(let k=0;k<dimensions&&square<radius*radius;k++)square+=(right.q[k]-left.q[k])**2
   if(square>=radius*radius)continue
   const distance=Math.sqrt(square)
   if(distance<1e-8){for(let k=0;k<dimensions;k++){const kick=random()*.1*(options.repulsion??1);acceleration[i][k]+=kick;acceleration[j][k]-=kick}continue}
   const force=-lawMagnitude(1-distance/radius,options.repulsionLaw,options.repulsionAlpha)*(options.repulsion??1)*.65/distance
   for(let k=0;k<dimensions;k++){const push=(right.q[k]-left.q[k])*force;acceleration[i][k]+=push;acceleration[j][k]-=push}
  }
  nodes.forEach((n,i)=>{
   const acc=acceleration[i]
   const mass=Math.pow((n.renderRadius??10)/10,2)
   for(let k=0;k<dimensions;k++)acc[k]+=-n.q[k]*.0003*(options.centralGravity??0)*mass+random()*.15*(options.dither??0)
  })
  // Relationship springs use the full N-dimensional distance, including W, without a
  // neighborhood cutoff: connected organizations can attract from anywhere.
  for(const {a,b,support} of pairs.values()){
   const delta=nodes[b].q.map((v,k)=>v-nodes[a].q[k]),distance=Math.hypot(...delta)
   if(distance<1e-8)continue
   const rest=(nodes[a].renderRadius??10)+(nodes[b].renderRadius??10)+(support?35:70)
   const error=(distance-rest)/100
   const force=Math.sign(error)*lawMagnitude(Math.abs(error),options.attractionLaw,options.attractionAlpha)*.08*(support?(options.proximity??1):(options.attraction??1))
   for(let k=0;k<dimensions;k++){const pull=delta[k]/distance*force;acceleration[a][k]+=pull;acceleration[b][k]-=pull}
  }
  nodes.forEach((n,i)=>{for(let k=0;k<dimensions;k++){
   n.velocityND[k]=Math.max(-8,Math.min(8,(n.velocityND[k]+acceleration[i][k])*friction));n.q[k]+=n.velocityND[k]
   if(Math.abs(n.q[k])>extent){n.q[k]=Math.sign(n.q[k])*extent;n.velocityND[k]*=-.7}
  }})
 }}
}
