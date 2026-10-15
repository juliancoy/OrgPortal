// Particle Life: asymmetric category forces, extended to four spatial axes.
export const LIFE_TYPES=['ecosystem','company','health','university','funding','general','federal-government','state-government']
export function lifeMatrix(seed=1){let state=Number(seed)>>>0;return LIFE_TYPES.map(()=>LIFE_TYPES.map(()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296*2-1}))}
export function project4D(q,angles=[0,0,0],perspective=.35,extent=600){
 const p=[...q]
 angles.forEach((degrees,axis)=>{const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a),v=p[axis];p[axis]=c*v-s*p[3];p[3]=s*v+c*p[3]})
 const scale=1/(1-Math.max(0,Math.min(.8,perspective))*p[3]/(extent*2.1))
 return p.slice(0,3).map(v=>v*scale)
}
export function createParticleLife4D(nodes,options={}){
 const extent=options.extent??Math.max(180,90*Math.pow(nodes.length, .25)),radius=Math.max(50,Math.min(600,Number(options.lifeRadius)||300)),friction=Math.max(.1,Math.min(.98,Number(options.lifeFriction)||.85)),matrix=lifeMatrix(options.lifeSeed??1)
 const types=nodes.map(n=>LIFE_TYPES.includes(n.category)?LIFE_TYPES.indexOf(n.category):LIFE_TYPES.indexOf('general'))
 nodes.forEach((n,i)=>{
  if(!n.q?.every(Number.isFinite)||n.q.length!==4){let state=i+1;n.q=Array.from({length:4},()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return (state/4294967296*2-1)*extent*.8})}
  n.q=n.q.map(v=>Math.max(-extent,Math.min(extent,v)))
  if(!n.velocity4?.every(Number.isFinite)||n.velocity4.length!==4)n.velocity4=[0,0,0,0]
 })
 const offsets=[];for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(let c=-1;c<=1;c++)for(let d=-1;d<=1;d++)offsets.push([a,b,c,d])
 let randomState=42
 const random=()=>{randomState=(Math.imul(1664525,randomState)+1013904223)>>>0;return randomState/4294967296-.5}
 return {extent,tick(){
  const cells=new Map(),coordinates=nodes.map(n=>n.q.map(x=>Math.floor(x/radius)))
  coordinates.forEach((p,i)=>{const key=p.join(',');if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i)})
  const acceleration=nodes.map(()=>[0,0,0,0])
  nodes.forEach((n,i)=>{
   const cell=coordinates[i],acc=acceleration[i]
   for(const offset of offsets){const bucket=cells.get(cell.map((v,k)=>v+offset[k]).join(','));if(!bucket)continue
    for(const j of bucket){if(i===j)continue;const delta=nodes[j].q.map((v,k)=>v-n.q[k]),distance=Math.hypot(...delta);if(distance>=radius)continue
     if(distance<1e-8){for(let k=0;k<4;k++)acc[k]+=random()*.1;continue}
     const r=distance/radius,beta=.25,force=r<beta?(r/beta-1)*(options.repulsion??1):matrix[types[i]][types[j]]*(1-Math.abs(2*r-1-beta)/(1-beta))*(options.attraction??1)
     for(let k=0;k<4;k++)acc[k]+=delta[k]/distance*force*.65
    }
   }
   const mass=Math.pow((n.renderRadius??10)/10,2)
   for(let k=0;k<4;k++)acc[k]+=-n.q[k]*.0003*(options.centralGravity??0)*mass+random()*.15*(options.dither??0)
  })
  nodes.forEach((n,i)=>{for(let k=0;k<4;k++){
   n.velocity4[k]=Math.max(-8,Math.min(8,(n.velocity4[k]+acceleration[i][k])*friction));n.q[k]+=n.velocity4[k]
   if(Math.abs(n.q[k])>extent){n.q[k]=Math.sign(n.q[k])*extent;n.velocity4[k]*=-.7}
  }})
 }}
}
