import test from 'node:test'
import assert from 'node:assert/strict'
import {createParticleLife4D,project4D,movement4D,lifeMatrix} from '../src/features/ecosystem/particle-life-4d.js'
test('W participates in neighbor distance and acceleration',()=>{
 const near=[{q:[0,0,0,0],category:'company'},{q:[0,0,0,10],category:'health'}]
 createParticleLife4D(near,{lifeRadius:100}).tick()
 assert(near[0].velocity4[3]<0);assert(near[1].velocity4[3]>0)
 assert.equal(near[0].q[0],0)
 const far=[{q:[0,0,0,0]},{q:[0,0,0,150]}];createParticleLife4D(far,{lifeRadius:100}).tick();assert.deepEqual(far[0].velocity4,[0,0,0,0])
})
test('category matrix is deterministic, seedable and asymmetric',()=>{
 assert.deepEqual(lifeMatrix(4),lifeMatrix(4));assert.notDeepEqual(lifeMatrix(4),lifeMatrix(5));assert.notEqual(lifeMatrix(4)[0][1],lifeMatrix(4)[1][0])
})
test('4D rotation and perspective reveal W without mutating simulation coordinates',()=>{
 const q=[10,20,30,40];assert.deepEqual(project4D(q,[0,0,0],0),[10,20,30]);assert(Math.abs(project4D(q,[90,0,0],0)[0]+40)<1e-8)
 assert(project4D(q)[0]>10);assert.deepEqual(q,[10,20,30,40])
})
test('dense 4D simulation stays finite inside reflecting boundaries at maximum forces',()=>{
 const nodes=Array.from({length:100},(_,i)=>({id:i,category:i%2?'company':'health',renderRadius:30}))
 const sim=createParticleLife4D(nodes,{attraction:3,repulsion:3,centralGravity:3,dither:3,lifeFriction:.98})
 for(let i=0;i<300;i++)sim.tick()
 for(const n of nodes){assert(n.q.every(v=>Number.isFinite(v)&&Math.abs(v)<=sim.extent));assert(n.velocity4.every(v=>Number.isFinite(v)&&Math.abs(v)<=8))}
})

test('fourth-dimensional camera movement changes projection without changing particle coordinates',()=>{
 const point=[30,20,10,40],original=[...point]
 const baseline=project4D(point,[0,0,0],.35,600)
 const forward=project4D(point,[0,0,0],.35,600,[0,0,0,120])
 const backward=project4D(point,[0,0,0],.35,600,[0,0,0,-120])
 assert(forward[0]<baseline[0]);assert(backward[0]>baseline[0])
 assert.deepEqual(point,original)
 assert.deepEqual(project4D(point,[0,0,0],.35,600,[0,0,0,0]),baseline)
 assert.deepEqual(project4D(point,[0,0,0],0,600,[0,0,0,120]),point.slice(0,3))
 assert.equal(project4D(point,[0,0,0],.8,600,[0,0,0,-1e9]),null)
})

test('translation uses world units before perspective and rotation',()=>{
 const q=[100,50,25,100],camera=[20,10,5,50],angles=[23,41,-18]
 assert.deepEqual(project4D(q,angles,.5,200,camera),project4D(q.map((v,i)=>v-camera[i]),angles,.5,200))
 assert.deepEqual(project4D(q,[0,0,0],0,200,camera),[80,40,20])
 const origin=[...camera],delta=movement4D([12,-7,4,30],angles)
 const moved=camera.map((v,i)=>v+delta[i]),returned=moved.map((v,i)=>v-delta[i])
 project4D(q,angles,.5,200,moved)
 const a=project4D(q,angles,.5,200,returned),b=project4D(q,angles,.5,200,origin)
 a.forEach((v,i)=>assert(Math.abs(v-b[i])<1e-10))
 assert(Math.abs(delta.reduce((sum,v)=>sum+v*v,0)-(144+49+16+900))<1e-9)
 // A viewing-frame step becomes exactly that step after camera rotation.
 const rotated=project4D(delta,angles,0,200)
 rotated.forEach((v,i)=>assert(Math.abs(v-[12,-7,4][i])<1e-10))
})
test('W travel keeps changing magnification until points cross the near plane',()=>{
 const q=[100,50,25,0],at=w=>project4D(q,[0,0,0],.5,200,[0,0,0,w])
 assert(at(-780)[0]>at(-700)[0]);assert.equal(at(-800),null);assert.equal(at(-1200),null)
 assert.deepEqual(at(0),q.slice(0,3))
})
