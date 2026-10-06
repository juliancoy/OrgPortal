import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { financialPull, layoutNetwork } from '../src/features/ecosystem/ecosystem-physics.js'
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
