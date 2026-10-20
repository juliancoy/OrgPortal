import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createFrameBudget,createPositionQueue,createFrameRate,frameTargetMs} from '../src/features/ecosystem/frame-budget.js'
test('slow frames reduce work aggressively, fast frames restore it within limits',()=>{
 const b=createFrameBudget(256);b.observe(140,2000);assert(b.count(2000)<256)
 for(let i=0;i<30;i++)b.observe(150,2000)
 assert.equal(b.count(2000),1)
 for(let i=0;i<120;i++)b.observe(60,2000)
 assert(b.count(2000)>256);assert(b.count(50)<=50);assert.equal(b.count(0),0)
})
test('latest snapshot replaces stale work without starving later nodes',()=>{
 const q=createPositionQueue(),seen=[]
 for(let version=0;version<4;version++){
  q.offer([version],10)
  const updated=q.take(10,3,(data,i)=>seen.push([i,data[0]]))
  assert.equal(updated.length,3)
 }
 assert.deepEqual(seen.slice(0,10).map(([i])=>i),[0,1,2,3,4,5,6,7,8,9])
 assert.equal(seen[3][1],1)
 while(q.pending())q.take(10,3,()=>{})
 assert.deepEqual(q.take(10,3,()=>{throw Error('drained')}),[])
})
test('FPS counts rendered frames and becomes idle after rendering stops',()=>{
 const fps=createFrameRate();assert.equal(fps.value(0),null)
 for(let now=0;now<=1000;now+=20)fps.frame(now)
 assert(Math.abs(fps.value(1000)-50)<3);assert.equal(fps.value(2100),null)
 fps.reset();assert.equal(fps.value(2200),null)
})

import {createNetworkLayout} from '../src/features/ecosystem/network-layout.js'
test('4D projection changes share the node budget and eventually reach every node',()=>{
 const original=globalThis.Worker;let worker
 globalThis.Worker=class {constructor(){worker=this}postMessage(){}terminate(){}}
 try{
  const nodes=Array.from({length:12},(_,i)=>({id:String(i),category:'company',renderRadius:10}))
  const layout=createNetworkLayout(nodes,[],{dimensions:4},false,()=>{})
  layout.projection([30,0,0],.35)
  const seen=new Set()
  while(layout.pending()){const changed=layout.consume(3);assert(changed.size<=3);for(const id of changed)seen.add(id)}
  assert.equal(seen.size,12)
  worker.onmessage({data:new Float64Array(12*8).fill(5)})
  layout.projection([60,0,0],.35)
  assert.equal(layout.consume(3).size,3)
  assert(layout.pending());layout.stop()
 }finally{globalThis.Worker=original}
})

test('configured FPS target changes node budgeting and validates bounds',()=>{
 const relaxed=createFrameBudget(100),strict=createFrameBudget(100)
 relaxed.observe(60,1000,10);strict.observe(60,1000,30)
 assert(relaxed.count(1000)>100);assert(strict.count(1000)<100)
 assert.equal(frameTargetMs(20),50);assert.equal(frameTargetMs(0),1000)
 assert.equal(frameTargetMs(500),1000/120);assert.equal(frameTargetMs(NaN),100)
})
