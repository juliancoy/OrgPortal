import {test} from 'node:test'
import assert from 'node:assert/strict'
import {practiceGrid,practiceTesseract,transformPracticePoint} from '../src/features/ecosystem/navigation-practice.js'
import {projectND} from '../src/features/ecosystem/particle-life-4d.js'
test('practice lattice has measured lines on XYZ and five labeled W layers',()=>{
 const grid=practiceGrid()
 assert.equal(grid.segments.length,375);assert.equal(grid.labels.length,18)
 assert.deepEqual([...new Set(grid.segments.map(s=>s.w))],[-200,-100,0,100,200])
 for(const segment of grid.segments){
  assert.equal(segment.to[segment.axis]-segment.from[segment.axis],200)
  for(let axis=0;axis<3;axis++)if(axis!==segment.axis){assert.equal(segment.from[axis],segment.to[axis]);assert.equal(Math.abs(segment.from[axis]%50),0)}
  assert.equal(segment.from[3],segment.to[3])
 }
 for(const axis of ['X','Y','Z','W'])assert(grid.labels.some(label=>label.text.startsWith(axis)))
})
test('practice W travel changes projection and retains measured grid coordinates',()=>{
 const point=practiceGrid().segments[0].from,original=[...point]
 assert.notDeepEqual(projectND(point,[0,0,0],.5,200,[0,0,0,0]),projectND(point,[0,0,0],.5,200,[0,0,0,50]))
 assert.deepEqual(point,original)
})

test('tesseract has sixteen vertices, thirty-two unique edges, four edges at each vertex',()=>{
 const {segments,labels}=practiceTesseract()
 assert.equal(labels.length,16);assert.equal(segments.length,32)
 const degrees=new Map(labels.map(l=>[l.point.join(','),0])),edges=new Set()
 for(const {from,to,axis} of segments){
  assert.equal(from.filter((v,i)=>v!==to[i]).length,1);assert.equal(to[axis]-from[axis],200)
  const key=[from.join(','),to.join(',')].sort().join(':');assert(!edges.has(key));edges.add(key)
  for(const p of [from,to])degrees.set(p.join(','),degrees.get(p.join(','))+1)
 }
 assert([...degrees.values()].every(n=>n===4))
})
test('W rotation preserves lengths in each plane and a full turn restores the tesseract',()=>{
 for(let plane=0;plane<3;plane++)for(const {point} of practiceTesseract().labels){
  const rotated=transformPracticePoint(point,plane,37,1),turned=transformPracticePoint(point,plane,360,1)
  assert(Math.abs(rotated.reduce((sum,v)=>sum+v*v,0)-40000)<1e-8)
  turned.forEach((v,i)=>assert(Math.abs(v-point[i])<1e-8))
  const quarter=transformPracticePoint(point,plane,90,1)
  assert(Math.abs(quarter[plane]+point[3])<1e-8);assert(Math.abs(quarter[3]-point[plane])<1e-8)
 }
})
test('W stretch affects only W before rotation without mutating source coordinates',()=>{
 const p=[10,20,30,40];assert.deepEqual(transformPracticePoint(p,0,0,2),[10,20,30,80]);assert.deepEqual(p,[10,20,30,40])
 assert.deepEqual(transformPracticePoint(p,0,0,1),p)
})
