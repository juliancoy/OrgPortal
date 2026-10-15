import test from 'node:test'
import assert from 'node:assert/strict'
import {createParticleLife4D,project4D,lifeMatrix} from '../src/features/ecosystem/particle-life-4d.js'
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
