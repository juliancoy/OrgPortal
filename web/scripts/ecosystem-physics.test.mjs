import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { financialPull, layoutNetwork, assignEdgeCurvature, forceNodeEdgeRepulsion, forceCrossingAttraction } from '../src/features/ecosystem/ecosystem-physics.js'
import { graphRelationships, financialNodeAmounts, financialNodeRadius } from '../src/features/ecosystem/portal-ecosystem.js'
const edge=amount=>({source:'a',target:'b',kind:'transfer',currency:'USD',amount})
const distance=amount=>{
 const nodes=[{id:'a'},{id:'b'}];layoutNetwork(nodes,[edge(amount)],()=>10,()=>({x:0,y:0}));return Math.hypot(nodes[0].x-nodes[1].x,nodes[0].y-nodes[1].y)
}
test('larger financial ties settle closer without overlapping',()=>{
 assert.ok(financialPull(edge(1e6))>financialPull(edge(1000)))
 assert.ok(distance(1e6)<distance(1000));assert.ok(distance(1e15)>=32-.001)
 for(const amount of [null,0,-1,Infinity,NaN])assert.equal(financialPull(edge(amount)),0)
 assert.equal(financialPull({...edge(1e6),kind:'capitalization'}),0)
 assert.equal(financialPull({...edge(1e6),currency:'EUR'}),0)
})
test('duplicate reports do not amplify attraction',()=>{
 const run=edges=>{const nodes=[{id:'a'},{id:'b'}];layoutNetwork(nodes,edges,()=>10,()=>({x:0,y:0}));return nodes.map(n=>[n.x,n.y])}
 assert.deepEqual(run([edge(1e6)]),run([edge(1e6),edge(1e6),edge(1000)]))
})
test('dense coincident hub stays finite and collision-free',()=>{
 const nodes=Array.from({length:100},(_,i)=>({id:String(i),x:0,y:0}))
 const edges=nodes.slice(1).map(n=>({...edge(1e15),source:'0',target:n.id}))
 layoutNetwork(nodes,edges,()=>30,()=>({x:0,y:0}))
 check(nodes,()=>30)
})
function check(nodes,radius){
 for(const n of nodes)assert.ok(Number.isFinite(n.x)&&Number.isFinite(n.y))
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)assert.ok(Math.hypot(nodes[i].x-nodes[j].x,nodes[i].y-nodes[j].y)>=radius(nodes[i])+radius(nodes[j])+12-.01,`overlap ${i},${j}`)
}
test('public evidence snapshot remains collision-free',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/ecosystem-data/ecosystem-portal.json',import.meta.url)))
 const amounts=financialNodeAmounts(data),nodes=data.organizations.map(n=>({...n,financialAmount:amounts.get(n.id)}))
 const radius=n=>financialNodeRadius(n.financialAmount)
 layoutNetwork(nodes,graphRelationships(data).map(e=>({...e})),radius,()=>({x:0,y:0}));check(nodes,radius)
})
test('live physics advances on caller ticks and preserves positions on rebuild',()=>{
 const nodes=[{id:'a',x:-300,y:0},{id:'b',x:300,y:0}]
 const sim=layoutNetwork(nodes,[edge(1000)],()=>10,()=>({x:0,y:0}),{live:true})
 assert.equal(nodes[0].x,-300)
 sim.tick(60)
 assert.ok(nodes[0].x>-300&&nodes[1].x<300)
 const before=nodes.map(n=>[n.x,n.y])
 layoutNetwork(nodes,[edge(1000)],()=>10,()=>({x:0,y:0}),{live:true})
 assert.deepEqual(nodes.map(n=>[n.x,n.y]),before)
 sim.tick(400)
 assert.ok(Math.hypot(nodes[0].x-nodes[1].x,nodes[0].y-nodes[1].y)>=32)
})
test('size-based attraction reaches disconnected nodes and repulsion stays local',()=>{
 const move=(size,options={})=>{
  const nodes=[{id:'a',x:0,y:0,fx:0,fy:0},{id:'b',x:500,y:0}]
  const sim=layoutNetwork(nodes,[],n=>n.id==='a'?size:6,()=>({x:0,y:0}),{live:true,repulsion:0,...options})
  sim.tick();return 500-nodes[1].x
 }
 assert.ok(move(30)>move(6),'larger USD icons exert stronger attraction')
 assert.ok(move(6)>0,'disconnected nodes attract')
 assert.equal(move(30,{attraction:0,repulsion:3}),0,'distant nodes do not repel apart')
 const nodes=[{id:'a',x:-50,y:0},{id:'b',x:50,y:0}]
 const sim=layoutNetwork(nodes,[],()=>6,()=>({x:0,y:0}),{live:true,attraction:0,repulsion:1})
 sim.tick();assert.ok(nodes[1].x>50,'nearby nodes repel')
})
test('maximum control settings stay finite with a dense financial hub',()=>{
 const nodes=Array.from({length:60},(_,i)=>({id:String(i),x:0,y:0}))
 const edges=nodes.slice(1).map(n=>({...edge(1e12),source:'0',target:n.id}))
 const sim=layoutNetwork(nodes,edges,()=>30,()=>({x:0,y:0}),{live:true,attraction:3,repulsion:3})
 sim.tick(300)
 for(const n of nodes)assert.ok(Number.isFinite(n.x)&&Number.isFinite(n.y)&&Math.abs(n.x)<10000&&Math.abs(n.y)<10000)
})
test('recipients stay with their documented source even when global attraction is off',()=>{
 const run=(proximity,kind='transfer')=>{
  const nodes=[{id:'source',x:-250,y:0,fx:-250,fy:0},{id:'other',x:250,y:0,fx:250,fy:0},{id:'recipient',x:200,y:100}]
  const sim=layoutNetwork(nodes,[{source:'source',target:'recipient',kind}],()=>10,()=>({x:0,y:0}),{live:true,attraction:0,repulsion:1,proximity})
  sim.tick(260);return Math.hypot(nodes[0].x-nodes[2].x,nodes[0].y-nodes[2].y)
 }
 assert.ok(run(1)<100,'undisclosed award still tethers the recipient')
 assert.ok(run(1,'incubation')<100,'incubated organization stays near its sponsor')
 assert.ok(run(0)>400,'source proximity is independent and adjustable')
})
test('live force evaluation caches node radii rather than repeatedly reading UI state',()=>{
 const nodes=Array.from({length:30},(_,i)=>({id:String(i)})),edges=nodes.slice(1).map(n=>({...edge(1000),source:'0',target:n.id}))
 let calls=0;const radius=()=>{calls++;return 10}
 const sim=layoutNetwork(nodes,edges,radius,()=>({x:0,y:0}),{live:true});const initial=calls
 sim.tick(100);assert.equal(calls,initial);assert.equal(initial,nodes.length)
 assert.equal(sim.force('collision').iterations(),2)
})

test('single edges stay straight and reverse reports occupy symmetric lanes',()=>{
 const edges=[{id:'single',source:'x',target:'y'},{id:'one',source:'a',target:'b'},{id:'two',source:'b',target:'a'}]
 assignEdgeCurvature(edges)
 assert.equal(edges[0].curveOffset,0)
 const offsets=()=>edges.slice(1).map(e=>e.curveOffset*(e.source==='a'?1:-1))
 assert.deepEqual(offsets(),[-9,9])
 assignEdgeCurvature(edges.slice().reverse())
 assert.deepEqual(offsets(),[-9,9])
})
test('edge clearance separates collinear nodes with balanced endpoint reactions',()=>{
 const a={id:'a',x:-100,y:0,vx:0,vy:0},b={id:'b',x:100,y:0,vx:0,vy:0}
 const n={id:'n',x:0,y:0,vx:0,vy:0},far={id:'far',x:0,y:100,vx:0,vy:0}
 forceNodeEdgeRepulsion([a,b,n,far],[{source:a,target:b}],()=>10)(1)
 assert.ok(n.vy>0)
 assert.ok(a.vy<0&&b.vy<0)
 assert.equal(a.vy+b.vy+n.vy,0)
 assert.equal(far.vy,0)
 assert.ok([a,b,n,far].every(node=>Number.isFinite(node.vx)&&Number.isFinite(node.vy)))
})

test('crossings attract children while shared endpoints do not',()=>{
 const node=(x,y)=>({x,y,vx:0,vy:0})
 const a=node(-100,-100),b=node(100,100),c=node(-100,100),d=node(100,-100)
 forceCrossingAttraction([{source:a,target:b},{source:c,target:d}],()=>10)(1)
 assert.ok(b.vx<0&&b.vy<0&&d.vx<0&&d.vy>0)
 assert.equal(a.vx,0);assert.equal(c.vx,0)
 const e=node(100,-100)
 forceCrossingAttraction([{source:a,target:c},{source:a,target:e}],()=>10)(1)
 assert.equal(e.vx,0)
})
