import test from 'node:test'
import assert from 'node:assert/strict'
import {createNetworkND,projectND,movementND} from '../src/features/ecosystem/particle-life-4d.js'
test('W participates in neighbor distance and acceleration',()=>{
 const near=[{q:[0,0,0,0],category:'company'},{q:[0,0,0,10],category:'health'}]
 createNetworkND(near,[],{lifeRadius:100}).tick()
 assert(near[0].velocityND[3]<0);assert(near[1].velocityND[3]>0)
 assert.equal(near[0].q[0],0)
 const far=[{q:[0,0,0,0]},{q:[0,0,0,150]}];createNetworkND(far,[],{lifeRadius:100}).tick();assert.deepEqual(far[0].velocityND,[0,0,0,0])
})
test('4D rotation and perspective reveal W without mutating simulation coordinates',()=>{
 const q=[10,20,30,40];assert.deepEqual(projectND(q,[0,0,0],0),[10,20,30]);assert(Math.abs(projectND(q,[90,0,0],0)[0]+40)<1e-8)
 assert(projectND(q)[0]>10);assert.deepEqual(q,[10,20,30,40])
})
test('dense 4D simulation stays finite inside reflecting boundaries at maximum forces',()=>{
 const nodes=Array.from({length:100},(_,i)=>({id:i,category:i%2?'company':'health',renderRadius:30}))
 const sim=createNetworkND(nodes,[],{attraction:3,repulsion:3,centralGravity:3,dither:3,lifeFriction:.98})
 for(let i=0;i<300;i++)sim.tick()
 for(const n of nodes){assert(n.q.every(v=>Number.isFinite(v)&&Math.abs(v)<=sim.extent));assert(n.velocityND.every(v=>Number.isFinite(v)&&Math.abs(v)<=8))}
})

test('fourth-dimensional camera movement changes projection without changing particle coordinates',()=>{
 const point=[30,20,10,40],original=[...point]
 const baseline=projectND(point,[0,0,0],.35,600)
 const forward=projectND(point,[0,0,0],.35,600,[0,0,0,120])
 const backward=projectND(point,[0,0,0],.35,600,[0,0,0,-120])
 assert(forward[0]<baseline[0]);assert(backward[0]>baseline[0])
 assert.deepEqual(point,original)
 assert.deepEqual(projectND(point,[0,0,0],.35,600,[0,0,0,0]),baseline)
 assert.deepEqual(projectND(point,[0,0,0],0,600,[0,0,0,120]),point.slice(0,3))
 assert.equal(projectND(point,[0,0,0],.8,600,[0,0,0,-1e9]),null)
})

test('translation uses world units before perspective and rotation',()=>{
 const q=[100,50,25,100],camera=[20,10,5,50],angles=[23,41,-18]
 assert.deepEqual(projectND(q,angles,.5,200,camera),projectND(q.map((v,i)=>v-camera[i]),angles,.5,200))
 assert.deepEqual(projectND(q,[0,0,0],0,200,camera),[80,40,20])
 const origin=[...camera],delta=movementND([12,-7,4,30],angles)
 const moved=camera.map((v,i)=>v+delta[i]),returned=moved.map((v,i)=>v-delta[i])
 projectND(q,angles,.5,200,moved)
 const a=projectND(q,angles,.5,200,returned),b=projectND(q,angles,.5,200,origin)
 a.forEach((v,i)=>assert(Math.abs(v-b[i])<1e-10))
 assert(Math.abs(delta.reduce((sum,v)=>sum+v*v,0)-(144+49+16+900))<1e-9)
 // A viewing-frame step becomes exactly that step after camera rotation.
 const rotated=projectND(delta,angles,0,200)
 rotated.forEach((v,i)=>assert(Math.abs(v-[12,-7,4][i])<1e-10))
})
test('W travel keeps changing magnification until points cross the near plane',()=>{
 const q=[100,50,25,0],at=w=>projectND(q,[0,0,0],.5,200,[0,0,0,w])
 assert(at(-780)[0]>at(-700)[0]);assert.equal(at(-800),null);assert.equal(at(-1200),null)
 assert.deepEqual(at(0),q.slice(0,3))
})

test('relationships pull through W beyond the repulsion radius; categories do not attract',()=>{
 const make=()=>[{id:'a',q:[0,0,0,-160],category:'company'},{id:'b',q:[0,0,0,160],category:'health'}]
 const linked=make(),unlinked=make()
 createNetworkND(linked,[{source:'a',target:'b'}],{lifeRadius:50,repulsion:0}).tick()
 createNetworkND(unlinked,[],{lifeRadius:50,repulsion:0}).tick()
 assert(linked[0].velocityND[3]>0);assert(linked[1].velocityND[3]<0)
 assert.deepEqual(linked[0].velocityND.slice(0,3),[0,0,0])
 assert.deepEqual(unlinked[0].velocityND,[0,0,0,0])
 const disabled=make();createNetworkND(disabled,[{source:'a',target:'b'}],{attraction:0,repulsion:0}).tick()
 assert.deepEqual(disabled[0].velocityND,[0,0,0,0])
})

test('relationship forces are independent of axis and duplicate evidence',()=>{
 const run=(axis,edges,options={})=>{
  const q=[0,0,0,0];q[axis]=150
  const nodes=[{id:'a',q:[0,0,0,0]},{id:'b',q}]
  createNetworkND(nodes,edges,{repulsion:0,...options}).tick()
  return nodes[0].velocityND[axis]
 }
 const edge={source:'a',target:'b'}
 assert.equal(run(0,[edge]),run(3,[edge]))
 assert.equal(run(3,[edge]),run(3,[edge,{source:'b',target:'a'}]))
 assert.equal(run(3,[{...edge,kind:'services'}],{proximity:0}),0)
 assert(run(3,[{...edge,kind:'services'}],{proximity:1})>0)
})

test('N-dimensional forces and velocity span every axis, including beyond the UI limit',()=>{
 for(const dimensions of [4,8,16,32,64]){
  const point=Array(dimensions).fill(0);point[dimensions-1]=150
  const nodes=[{id:'a',q:Array(dimensions).fill(0)},{id:'b',q:point}]
  const sim=createNetworkND(nodes,[{source:'a',target:'b'}],{dimensions,repulsion:0})
  sim.tick()
  assert(nodes[0].velocityND[dimensions-1]>0)
  assert(nodes[0].velocityND.slice(0,-1).every(v=>v===0))
  for(let i=0;i<20;i++)sim.tick()
  assert(nodes.every(n=>n.q.length===dimensions&&n.q.every(Number.isFinite)))
 }
 assert.throws(()=>createNetworkND([],[],{dimensions:4.5}),/integer/)
})

test('every hidden axis can be rotated into the 3D view; movement reverses all rotations',()=>{
 for(const dimensions of [8,32,64]){
  const q=Array(dimensions).fill(0);q[dimensions-1]=100
  const angles=Array((dimensions-3)*3).fill(0);angles[(dimensions-4)*3]=90
  assert.deepEqual(projectND(q,[],0),[0,0,0])
  assert(Math.abs(projectND(q,angles,0)[0]+100)<1e-9)
  const rotations=angles.map((_,i)=>(i*17)%71),delta=Array.from({length:dimensions},(_,i)=>i-3)
  const world=movementND(delta,rotations)
  const projected=projectND(world,rotations,0)
  projected.forEach((v,i)=>assert(Math.abs(v-delta[i])<1e-9))
  assert(Math.abs(world.reduce((sum,v)=>sum+v*v,0)-delta.reduce((sum,v)=>sum+v*v,0))<1e-7)
 }
})

test('sweep repulsion uses hidden dimensions and handles coincident nodes',()=>{
 const dimensions=16,zero=()=>Array(dimensions).fill(0)
 const near=[{q:zero()},{q:zero()}];near[1].q[15]=10
 createNetworkND(near,[],{dimensions,lifeRadius:100}).tick()
 assert(near[0].velocityND[15]<0);assert(near[1].velocityND[15]>0)
 const far=[{q:zero()},{q:zero()}];far[1].q[15]=150
 createNetworkND(far,[],{dimensions,lifeRadius:100}).tick()
 assert(far[0].velocityND.every(v=>v===0))
 const coincident=[{q:zero()},{q:zero()}]
 createNetworkND(coincident,[],{dimensions}).tick()
 assert(coincident[0].velocityND.some(v=>v!==0))
 assert(coincident.every(n=>n.q.every(Number.isFinite)))
})
