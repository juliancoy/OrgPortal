import {test} from 'node:test'
import assert from 'node:assert/strict'
import {practiceGrid} from '../src/features/ecosystem/navigation-practice.js'
import {project4D} from '../src/features/ecosystem/particle-life-4d.js'
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
 assert.notDeepEqual(project4D(point,[0,0,0],.5,200,[0,0,0,0]),project4D(point,[0,0,0],.5,200,[0,0,0,50]))
 assert.deepEqual(point,original)
})
