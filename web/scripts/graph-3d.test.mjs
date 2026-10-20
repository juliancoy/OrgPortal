import {test} from 'node:test'
import assert from 'node:assert/strict'
import {layoutNetwork3D} from '../src/features/ecosystem/ecosystem-physics-3d.js'
test('3D forces operate in depth and preserve paused initial positions',()=>{
 const nodes=[{id:'a',x:0,y:0,z:-200,renderRadius:10},{id:'b',x:0,y:0,z:200,renderRadius:20}]
 const sim=layoutNetwork3D(nodes,[{source:'a',target:'b',kind:'transfer',currency:'USD',amount:1000}],{centralGravity:1,dither:1})
 assert.equal(nodes[0].z,-200);assert.equal(sim.numDimensions(),3)
 sim.tick(100);assert.ok(nodes[0].z>-200&&nodes[1].z<200)
 assert(nodes.every(n=>[n.x,n.y,n.z,n.vx,n.vy,n.vz].every(Number.isFinite)))
})
test('3D gravity and dither respect fixed axes and stay finite with dense funding links',()=>{
 const nodes=Array.from({length:40},(_,i)=>({id:String(i),x:Math.sin(i)*150,y:Math.cos(i)*150,z:i*5,renderRadius:15}))
 nodes[0].fx=0;nodes[0].fy=150;nodes[0].fz=0
 const edges=nodes.slice(1).map(n=>({source:'0',target:n.id,kind:'transfer',currency:'USD',amount:10000}))
 const sim=layoutNetwork3D(nodes,edges,{centralGravity:3,dither:3,attraction:3,repulsion:3})
 sim.tick(600);assert.equal(nodes[0].x,0);assert.equal(nodes[0].y,150);assert.equal(nodes[0].z,0)
 assert(nodes.every(n=>[n.x,n.y,n.z,n.vx,n.vy,n.vz].every(Number.isFinite)))
})

test('3D snapshots interpolate every node together and finish exactly',async()=>{
 const {createPositionTransition}=await import('../src/features/ecosystem/position-transition.js')
 const nodes=[{id:'a',x:0,y:0,z:0},{id:'b',x:10,y:20,z:30}],t=createPositionTransition(nodes)
 t.offer(new Float64Array([100,0,0,1,2,3,110,20,30,4,5,6]),0)
 assert.deepEqual([...t.consume(1000/60)],['a','b'])
 assert.equal(nodes[0].x,50);assert.equal(nodes[1].x,60)
 assert.equal(nodes[1].x-nodes[0].x,10)
 t.consume(1000/30);assert.equal(nodes[0].x,100);assert.equal(t.pending(),false)
 assert.equal(t.consume(100).size,0)
})
test('superseding a snapshot starts at the displayed positions without jumping',async()=>{
 const {createPositionTransition}=await import('../src/features/ecosystem/position-transition.js')
 const nodes=[{id:'a',x:0,y:0,z:0}],t=createPositionTransition(nodes)
 t.offer(new Float64Array([100,0,0,0,0,0]),0);t.consume(10)
 const before=nodes[0].x
 t.offer(new Float64Array([200,0,0,0,0,0]),100);t.consume(100);assert.equal(nodes[0].x,before)
 t.consume(150);assert.equal(nodes[0].x,(before+200)/2)
 t.consume(200);assert.equal(nodes[0].x,200);assert.equal(t.pending(),false)
})
