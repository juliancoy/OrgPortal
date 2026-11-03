import test from 'node:test'
import assert from 'node:assert/strict'
import {retainLayoutNodes,progressiveGraph,nextGraphFrame} from '../src/features/ecosystem/progressive-graph.js'
import {createNetworkLayout} from '../src/features/ecosystem/network-layout.js'
test('incremental metadata preserves identity, pins and full dimensional momentum',()=>{
 const old={id:'a',name:'old',x:12,vx:3,fx:12,q:[1,2,3,4,5],velocityND:[0,1,2,3,4]}
 const [same,newNode]=retainLayoutNodes([old],[{id:'a',name:'new',x:0,vx:0,fx:undefined,q:[0,0,0,0,0]},{id:'b'}])
 assert.equal(same,old);assert.equal(same.name,'new');assert.equal(same.fx,12);assert.equal(same.x,12);assert.deepEqual(same.q,[1,2,3,4,5]);assert.deepEqual(same.velocityND,[0,1,2,3,4]);assert.equal(newNode.id,'b')
})
test('batches retain snapshot totals and never expose dangling edges',()=>{
 const snapshot={version:'v1',total:1000,organizations:[{id:'a'},{id:'b'},{id:'c'}],relationships:[{id:'ab',source:'a',target:'b'},{id:'ac',source:'a',target:'c'}]}
 const stream=progressiveGraph(snapshot)
 assert.deepEqual(stream.take(1).relationships,[])
 const second=stream.take(1);assert.equal(second.total,1000);assert.equal(second.version,'v1');assert.equal(second.relationships.length,1)
 assert.deepEqual(stream.take(10),snapshot);assert.equal(stream.pending,false)
})
test('cancelled batch cannot continue',async()=>{
 const controller=new AbortController();controller.abort()
 await assert.rejects(nextGraphFrame(controller.signal),{name:'AbortError'})
})
for(const dimensions of [2,3,4,6])test(`${dimensions}D keeps one worker and ignores old topology frames`,()=>{
 const workers=[]
 const original=globalThis.Worker
 globalThis.Worker=class{constructor(){workers.push(this);this.messages=[]}postMessage(m){this.messages.push(m)}terminate(){this.terminated=true}}
 try{
  let notifications=0
  const options={dimensions},nodes=[{id:'a',x:10,y:20,z:30,q:Array(dimensions).fill(2),velocityND:Array(dimensions).fill(0)}]
  const layout=createNetworkLayout(nodes,[],options,false,()=>notifications++)
  const next=[...nodes,{id:'b',x:11,y:21,z:31,q:Array(dimensions).fill(3),velocityND:Array(dimensions).fill(0)}]
  layout.update(next,[],options,false)
  assert.equal(workers.length,1);assert.equal(workers[0].messages[1].type,'update');assert.equal(workers[0].messages[1].generation,1)
  workers[0].onmessage({data:{generation:0,positions:new Float64Array(dimensions*2)}})
  assert.equal(notifications,0)
  workers[0].onmessage({data:{generation:1,positions:new Float64Array(dimensions*4)}})
  assert.equal(notifications,1);layout.stop();assert.equal(workers[0].terminated,true)
 }finally{globalThis.Worker=original}
})

test('2D and 3D reuse their solver when topology changes',async()=>{
 const {layoutNetwork}=await import('../src/features/ecosystem/ecosystem-physics.js')
 const {layoutNetwork3D}=await import('../src/features/ecosystem/ecosystem-physics-3d.js')
 for(const dimensions of [2,3]){
  const a={id:'a',x:40,y:50,z:60,vx:2,vy:3,vz:4,renderRadius:10},b={id:'b',x:80,y:90,z:100,renderRadius:10}
  const make=(nodes,edges,existingSimulation)=>dimensions===2?layoutNetwork(nodes,edges,n=>n.renderRadius,()=>({x:0,y:0}),{live:true,existingSimulation}):layoutNetwork3D(nodes,edges,{existingSimulation})
  const solver=make([a,b],[{source:'a',target:'b'}]);solver.tick();const x=a.x,vx=a.vx
  assert.equal(make([a,{id:'c',x:0,y:0,z:0,renderRadius:10}],[],solver),solver)
  assert.equal(a.x,x);assert.equal(a.vx,vx);solver.tick();assert(Number.isFinite(a.x))
 }
})
test('N-D topology updates retain coordinates without reinitialization',async()=>{
 const {createNetworkND}=await import('../src/features/ecosystem/particle-life-4d.js')
 const a={id:'a',q:[500,2,3,4,5,6],velocityND:[1,2,3,4,5,6]}
 const solver=createNetworkND([a],[],{dimensions:6})
 solver.update([a,{id:'b'}],[{source:'a',target:'b'}])
 assert.deepEqual(a.q,[500,2,3,4,5,6]);assert.deepEqual(a.velocityND,[1,2,3,4,5,6]);solver.tick();assert(a.q.every(Number.isFinite))
})
