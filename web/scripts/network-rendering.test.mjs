import {test} from 'node:test'
import assert from 'node:assert/strict'
import {curvePoints} from '../src/features/ecosystem/webgpu-renderer.js'
import {createLabelGrid} from '../src/features/ecosystem/label-layout.js'

test('straight links use one segment while curved links preserve endpoints and lanes',()=>{
 const edge={source:{x:0,y:0,renderRadius:10},target:{x:100,y:0,renderRadius:10},curveOffset:0}
 const straight=curvePoints(edge),curved=curvePoints({...edge,curveOffset:20})
 assert.deepEqual(straight,[{x:12,y:0},{x:87,y:0}])
 assert.equal(curved.length,19)
 assert.deepEqual([curved[0],curved.at(-1)],straight)
 assert.ok(curved[9].y>0)
 assert.deepEqual(curvePoints({...edge,curveOffset:undefined}),straight)
})
test('spatial label placement matches exhaustive collision checks across cell boundaries',()=>{
 const grid=createLabelGrid(),placed=[]
 let seed=12345
 const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)
 for(let i=0;i<10000;i++){
  const x=(random()-.5)*4000,y=(random()-.5)*2500,width=10+random()*145
  const expected=placed.some(r=>Math.abs(x-r.x)<(width+r.width)/2+8&&Math.abs(y-r.y)<28)
  assert.equal(grid.overlaps(x,y,width),expected,`candidate ${i}`)
  if(!expected){grid.add(x,y,width);placed.push({x,y,width})}
 }
})
