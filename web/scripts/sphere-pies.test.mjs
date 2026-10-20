import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spherePieAtlas} from '../src/features/ecosystem/sphere-pies.js'
const pie={slices:[{startAngle:-Math.PI/2,endAngle:0,color:'#ff0000'},{startAngle:0,endAngle:Math.PI*1.5,color:'#0000ff'}]}
test('sphere wedges preserve 2D colors and 25/75 proportions',()=>{
 const atlas=spherePieAtlas([{financialPie:pie}])
 const pixels=Array.from({length:atlas.width},(_,i)=>[...atlas.data.slice(i*4,i*4+4)])
 assert.equal(pixels.filter(p=>p[0]===255&&p[2]===0).length,atlas.width/4)
 assert.equal(pixels.filter(p=>p[0]===0&&p[2]===255).length,atlas.width*3/4)
 assert(pixels.every(p=>p[3]===255))
})
test('packed sphere pies keep solid nodes and neighboring rows separate',()=>{
 const nodes=Array.from({length:17},(_,i)=>i%2?{}:{financialPie:pie}),atlas=spherePieAtlas(nodes,64)
 assert(atlas.width<=64&&atlas.height<=64)
 nodes.forEach((node,i)=>{
  const [u,v]=atlas.coordinates.slice(i*3,i*3+2),offset=(Math.floor(v*atlas.height)*atlas.width+Math.floor(u*atlas.width))*4
  assert.deepEqual([...atlas.data.slice(offset,offset+4)],node.financialPie?[255,0,0,255]:[255,255,255,255])
 })
 assert.equal(spherePieAtlas([]).coordinates.length,3)
})

test('sphere textures accept the HSL colors produced by the shared funding logic',async()=>{
 const {financialNodePies}=await import('../src/features/ecosystem/fund-pies.js')
 const data={organizations:[{id:'fund-a',name:'Fund A'},{id:'fund-b',name:'Fund B'},{id:'recipient',name:'Recipient'}],relationships:[
  {id:'a',source:'fund-a',target:'recipient',kind:'transfer',relationship:'funding',currency:'USD',amount:25},
  {id:'b',source:'fund-b',target:'recipient',kind:'transfer',relationship:'funding',currency:'USD',amount:75},
 ],financing:[]}
 const pie=financialNodePies(data).get('recipient')
 assert.equal(pie.total,100);assert.deepEqual(pie.slices.map(s=>s.share),[.75,.25])
 assert(pie.slices.every(s=>s.color.startsWith('hsl(')))
 const atlas=spherePieAtlas([{financialPie:pie}]),colors=new Map()
 for(let x=0;x<atlas.width;x++){
  const rgb=[...atlas.data.slice(x*4,x*4+3)];assert(rgb.some(channel=>channel>100),'funding slices must not turn black')
  const key=rgb.join(',');colors.set(key,(colors.get(key)||0)+1)
 }
 assert.deepEqual([...colors.values()].sort((a,b)=>a-b),[128,384])
})
