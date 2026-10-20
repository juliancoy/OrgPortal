import {test} from 'node:test'
import assert from 'node:assert/strict'
import {encodeSettings,decodeSettings} from '../src/features/ecosystem/network-settings.js'
import {initializeNetworkPositions} from '../src/features/ecosystem/network-initial-positions.js'
test('gzip URL state round trips settings without base64 URL delimiters',async()=>{
 const settings={'attraction':2.5,'show-links':false,'node-category:health':true,'node-size-algorithm':'exp','life-seed':127}
 const encoded=await encodeSettings(settings)
 assert.match(encoded,/^[\w-]+$/)
 assert.deepEqual(await decodeSettings(encoded),settings)
})
test('invalid and oversized compressed state is rejected',async()=>{
 await assert.rejects(decodeSettings('bad'))
 await assert.rejects(decodeSettings('x'.repeat(16001)))
 await assert.rejects(decodeSettings(await encodeSettings({x:'a'.repeat(65000)})))
 await assert.rejects(decodeSettings(await encodeSettings([])))
})
test('new nodes get reproducible seeds and saved coordinates survive initialization',()=>{
 for(const dimension of [2,3,4]){
  const a=[{id:'a'},{id:'b',x:7,y:9,z:11}],b=structuredClone(a)
  initializeNetworkPositions(a,dimension);initializeNetworkPositions(b,dimension)
  assert.deepEqual(a,b);assert.equal(a[1].x,7);assert.equal(a[1].z,11)
 }
})
import {forceCrossingAttraction} from '../src/features/ecosystem/ecosystem-physics.js'
test('crossing shortcut matches exhaustive detection',()=>{
 const nodes=Array.from({length:20},(_,i)=>({x:300*Math.cos(i*1.7),y:300*Math.sin(i*1.7),vx:0,vy:0}))
 const links=nodes.map((n,i)=>({source:n,target:nodes[(i*7+3)%nodes.length]})),crossed=new Set()
 const side=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x)
 for(let i=0;i<links.length;i++)for(let j=0;j<i;j++){
  const {source:a,target:b}=links[i],{source:c,target:d}=links[j]
  if(a===c||a===d||b===c||b===d)continue
  if(side(a,b,c)*side(a,b,d)<0&&side(c,d,a)*side(c,d,b)<0){crossed.add(links[i]);crossed.add(links[j])}
 }
 const expected=nodes.map(()=>[0,0])
 for(const {source:a,target:b} of crossed){const dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy),gap=d-44;if(gap<=0)continue;const impulse=Math.min(1.2,gap*.012)*.35;expected[nodes.indexOf(b)][0]+=dx/d*impulse;expected[nodes.indexOf(b)][1]+=dy/d*impulse}
 forceCrossingAttraction(links,()=>10)(.35)
 nodes.forEach((n,i)=>{assert(Math.abs(n.vx-expected[i][0])<1e-10);assert(Math.abs(n.vy-expected[i][1])<1e-10)})
})
