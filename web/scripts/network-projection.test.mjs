import test from 'node:test'
import assert from 'node:assert/strict'
import {createProjectionFrame,fitPCA,projectNetworkPoint,projectionMovement,PROJECTION_ALGORITHMS} from '../src/features/ecosystem/network-projection.js'
import {projectND} from '../src/features/ecosystem/particle-life-4d.js'
const close=(a,b,tolerance=1e-8)=>assert(Math.abs(a-b)<tolerance,`${a} != ${b}`)
test('PCA finds correlated hidden axes and centers translated samples',()=>{
 const points=[-2,-1,0,1,2].map(t=>[100,0,0,0,t,2*t,0,0])
 const frame=fitPCA(points,8)
 close(frame.mean[0],100);close(frame.variance[0],10)
 close(Math.abs(frame.basis[0][4]),1/Math.sqrt(5));close(Math.abs(frame.basis[0][5]),2/Math.sqrt(5))
 const projected=projectNetworkPoint(points.at(-1),frame,{algorithm:'pca'})
 close(Math.abs(projected[0]),2*Math.sqrt(5));close(projected[1],0);close(projected[2],0)
 for(const a of frame.basis)for(const b of frame.basis)close(a.reduce((sum,v,i)=>sum+v*b[i],0),a===b?1:0)
})
test('PCA handles empty, constant, and rank deficient data',()=>{
 for(const points of [[],[Array(8).fill(0)],Array.from({length:10},()=>Array(8).fill(20))]){
  const frame=fitPCA(points,8)
  assert(frame.mean.every(Number.isFinite));assert(frame.basis.flat().every(Number.isFinite))
  assert(projectNetworkPoint(Array(8).fill(20),frame,{algorithm:'pca'}).every(Number.isFinite))
 }
})
test('display dimensions are independent of computed dimensions for every algorithm',()=>{
 const points=Array.from({length:20},(_,i)=>Array.from({length:32},(_,j)=>Math.sin(i*2+j*3)*30))
 const original=structuredClone(points)
 for(const algorithm of PROJECTION_ALGORITHMS){
  const frame=createProjectionFrame(points,32,algorithm,9)
  for(const displayDimensions of [2,3]){
   const p=projectNetworkPoint(points[0],frame,{algorithm,displayDimensions,sliceWidth:1000})
   assert.equal(p.length,3);assert(p.every(Number.isFinite));if(displayDimensions===2)assert.equal(p[2],0)
  }
 }
 assert.deepEqual(points,original)
})
test('rotated perspective reproduces the existing projection',()=>{
 const q=[20,30,40,50,60,70,80,90],angles=[20,4,18,7,6,4]
 const frame=createProjectionFrame([q],8)
 assert.deepEqual(projectNetworkPoint(q,frame,{angles,camera:[4,2],extent:500}),projectND(q,angles,.35,500,[4,2]))
 const ortho=projectNetworkPoint(q,frame,{algorithm:'orthographic',angles})
 assert.deepEqual(ortho,projectND(q,angles,0))
})
test('seeded random frames are reproducible, orthonormal, and invert navigation',()=>{
 const frame=createProjectionFrame([],16,'random',42)
 assert.deepEqual(frame,createProjectionFrame([],16,'random',42));assert.notDeepEqual(frame,createProjectionFrame([],16,'random',43))
 for(const a of frame.basis)for(const b of frame.basis)close(a.reduce((sum,v,i)=>sum+v*b[i],0),a===b?1:0)
 const settings={algorithm:'random',angles:Array(39).fill(17),displayDimensions:3,sliceAxis:15}
 const movement=projectionMovement([10,20,30,0],frame,settings)
 const projected=projectNetworkPoint(movement,frame,settings)
 projected.forEach((v,i)=>close(v,[10,20,30][i]))
 const hidden=projectionMovement([0,0,0,10],frame,settings)
 projectNetworkPoint(hidden,frame,settings).forEach(v=>close(v,0))
})
test('slices clip hidden layers and radial shells preserve full-dimensional radius',()=>{
 const q=[3,4,0,100,0,0,0,0],frame=createProjectionFrame([],8)
 assert.equal(projectNetworkPoint(q,frame,{algorithm:'slice',sliceWidth:50}),null)
 assert(projectNetworkPoint(q,frame,{algorithm:'slice',sliceWidth:50,camera:[0,0,0,100]}))
 const radial=projectNetworkPoint(q,frame,{algorithm:'radial'})
 close(Math.hypot(...radial),Math.hypot(...q))
 assert(projectNetworkPoint([0,0,0,100,0,0,0,0],frame,{algorithm:'radial'}).every(Number.isFinite))
})

test('PCA eigenvectors satisfy the covariance eigenproblem in a dense 16D cloud',()=>{
 const dimensions=16,points=Array.from({length:100},(_,i)=>Array.from({length:dimensions},(_,j)=>Math.sin(i*(j+1)*.17)*(j+1)+Math.cos(i*.13)*j))
 const frame=fitPCA(points,dimensions)
 const cov=Array.from({length:dimensions},(_,j)=>Array.from({length:dimensions},(_,k)=>points.reduce((sum,p)=>sum+(p[j]-frame.mean[j])*(p[k]-frame.mean[k]),0)/points.length))
 frame.basis.forEach((axis,i)=>cov.forEach((row,j)=>close(row.reduce((sum,v,k)=>sum+v*axis[k],0),frame.variance[i]*axis[j],1e-6)))
})

test('projection updates finish within their budget even with continuous physics snapshots',async()=>{
 const {createNetworkLayout}=await import('../src/features/ecosystem/network-layout.js')
 const originalWorker=globalThis.Worker;let worker
 globalThis.Worker=class {constructor(){worker=this}postMessage(){}terminate(){}}
 try{
  const nodes=Array.from({length:5},(_,i)=>({id:String(i)})),layout=createNetworkLayout(nodes,[],{dimensions:8},true,()=>{})
  layout.projection([],0,[],{algorithm:'pca',displayDimensions:2})
  for(let i=0;i<3;i++){
   worker.onmessage({data:new Float64Array(5*8*2)})
   assert(layout.consume(2).size<=2)
  }
  assert.equal(layout.projectionPending(),false)
  assert(nodes.every(n=>n.z===0))
  layout.stop()
 }finally{globalThis.Worker=originalWorker}
})
