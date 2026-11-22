import {test} from 'node:test'
import assert from 'node:assert/strict'
import {sphereDetailLevel,edgeSegmentCount,SPHERE_DETAIL} from '../src/features/ecosystem/spatial-detail.js'
import {edgeArrowGeometry} from '../src/features/ecosystem/edge-arrows.js'
import {transactionEdgePath} from '../src/features/ecosystem/transaction-edge-path.js'

test('tiny spheres shed triangles, close spheres restore detail, and thresholds have hysteresis',()=>{
 assert.equal(sphereDetailLevel(1,0),3)
 assert.equal(sphereDetailLevel(50,3),0)
 assert.equal(sphereDetailLevel(4.5,3),3)
 assert.equal(sphereDetailLevel(3.5,2),2)
 assert.equal(sphereDetailLevel(8,3),2)
 assert.equal(sphereDetailLevel(20,3),1)
 const triangles=level=>2*SPHERE_DETAIL[level][0]*(SPHERE_DETAIL[level][1]-1)
 assert.ok(triangles(3)<triangles(0)/20)
})
test('straight links retain their complete shaft and arrow; curved and default links retain all segments',()=>{
 const edge={source:{x:0,y:0,z:0,renderRadius:7},target:{x:100,y:50,z:20,renderRadius:7},directional:true,curveOffset:0}
 assert.equal(edgeSegmentCount(edge,true),1);assert.equal(edgeSegmentCount(edge),8)
 assert.equal(edgeSegmentCount({...edge,curveOffset:25},true),8)
 assert.equal(edgeSegmentCount({...edge,curveOffset:-25},true),8)
 const geometry=edgeArrowGeometry(transactionEdgePath(edge),1.4,true),[first]=geometry.shaft,last=geometry.shaft.at(-1)
 assert.ok(geometry.head)
 // Every original shaft point lies on the replacement cylinder's centerline.
 for(const point of geometry.shaft){const t=(point.x-first.x)/(last.x-first.x);for(const axis of ['y','z'])assert.ok(Math.abs(point[axis]-(first[axis]+(last[axis]-first[axis])*t))<1e-10)}
})
