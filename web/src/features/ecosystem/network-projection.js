import {rotateND} from './particle-life-4d.js'
export const PROJECTION_ALGORITHMS=['perspective','orthographic','pca','random','radial','slice']
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0)
const identity=(axis,dimensions)=>Array.from({length:dimensions},(_,i)=>i===axis?1:0)
function orthogonal(vector,basis){
 const v=[...vector]
 for(const axis of basis){const amount=dot(v,axis);for(let i=0;i<v.length;i++)v[i]-=amount*axis[i]}
 const length=Math.hypot(...v)
 return length>1e-10?v.map(x=>x/length):null
}
// A symmetric Jacobi eigensolver fits PCA once, not on every animation frame.
export function fitPCA(points,dimensions){
 const mean=Array(dimensions).fill(0),cov=Array.from({length:dimensions},()=>Array(dimensions).fill(0))
 const sample=points.filter(p=>p?.length===dimensions&&p.every(Number.isFinite)).filter((_,i,all)=>i%Math.max(1,Math.ceil(all.length/1024))===0)
 for(const p of sample)for(let i=0;i<dimensions;i++)mean[i]+=p[i]/sample.length
 for(const p of sample)for(let i=0;i<dimensions;i++)for(let j=i;j<dimensions;j++)cov[i][j]+=(p[i]-mean[i])*(p[j]-mean[j])/sample.length
 for(let i=0;i<dimensions;i++)for(let j=0;j<i;j++)cov[i][j]=cov[j][i]
 const vectors=Array.from({length:dimensions},(_,i)=>identity(i,dimensions))
 const scale=Math.max(1,...cov.map((row,i)=>Math.abs(row[i])))
 for(let sweep=0;sweep<24;sweep++){
  let largest=0
  for(let p=0;p<dimensions;p++)for(let q=p+1;q<dimensions;q++){
   const off=cov[p][q];largest=Math.max(largest,Math.abs(off));if(Math.abs(off)<scale*1e-12)continue
   const angle=.5*Math.atan2(2*off,cov[q][q]-cov[p][p]),c=Math.cos(angle),s=Math.sin(angle)
   const pp=cov[p][p],qq=cov[q][q]
   for(let k=0;k<dimensions;k++)if(k!==p&&k!==q){
    const kp=cov[k][p],kq=cov[k][q]
    cov[k][p]=cov[p][k]=c*kp-s*kq;cov[k][q]=cov[q][k]=s*kp+c*kq
   }
   cov[p][p]=c*c*pp-2*s*c*off+s*s*qq;cov[q][q]=s*s*pp+2*s*c*off+c*c*qq;cov[p][q]=cov[q][p]=0
   for(let k=0;k<dimensions;k++){const kp=vectors[k][p],kq=vectors[k][q];vectors[k][p]=c*kp-s*kq;vectors[k][q]=s*kp+c*kq}
  }
  if(largest<scale*1e-10)break
 }
 const order=Array.from({length:dimensions},(_,i)=>i).sort((a,b)=>cov[b][b]-cov[a][a])
 const basis=order.slice(0,3).map(axis=>{
  const vector=vectors.map(row=>row[axis]),pivot=vector.reduce((best,v,i)=>Math.abs(v)>Math.abs(vector[best])?i:best,0)
  return vector.map(v=>v*(vector[pivot]<0?-1:1))
 })
 return {mean,basis,variance:order.map(i=>Math.max(0,cov[i][i]))}
}
export function createProjectionFrame(points,dimensions,algorithm='perspective',seed=1){
 if(!PROJECTION_ALGORITHMS.includes(algorithm))throw new Error('Unknown projection algorithm')
 if(algorithm==='pca')return fitPCA(points,dimensions)
 const basis=[];let state=Number(seed)>>>0
 for(let axis=0;axis<3;axis++){
  let vector=identity(axis,dimensions)
  if(algorithm==='random')vector=Array.from({length:dimensions},()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296-.5})
  let next=orthogonal(vector,basis)
  for(let i=0;!next&&i<dimensions;i++)next=orthogonal(identity(i,dimensions),basis)
  basis.push(next)
 }
 return {mean:Array(dimensions).fill(0),basis}
}
export function projectNetworkPoint(q,frame,{algorithm='perspective',displayDimensions=3,angles=[],perspective=.35,extent=600,camera=[],sliceAxis=3,sliceWidth=100}={}){
 const p=rotateND(q.map((v,i)=>v-frame.mean[i]-(camera[i]??0)),angles)
 if(algorithm==='slice'&&Math.abs(p[sliceAxis]??0)>sliceWidth/2)return null
 let projected=frame.basis.map(axis=>dot(p,axis))
 if(algorithm==='perspective'){
  const hidden=p.slice(3),depth=1-Math.max(0,Math.min(.8,perspective))*hidden.reduce((sum,v)=>sum+v,0)/(Math.sqrt(hidden.length||1)*extent*2.1)
  if(depth<=.05)return null
  projected=projected.map(v=>v/depth)
 }else if(algorithm==='random')projected=projected.map(v=>v*Math.sqrt(q.length/displayDimensions))
 else if(algorithm==='radial'){
  const length=Math.hypot(...p),visibleLength=Math.hypot(...projected.slice(0,displayDimensions))
  projected=visibleLength>1e-10?projected.map(v=>v*length/visibleLength):[length,0,0]
 }
 if(displayDimensions===2)projected[2]=0
 return projected
}
// Invert the linear viewing frame for navigation; the slice axis is orthogonal
// to displayed axes so E/Q explores hidden coordinates rather than panning.
export function projectionMovement(delta,frame,{algorithm='perspective',displayDimensions=3,angles=[],sliceAxis=3}={}){
 const dimensions=frame.mean.length,view=Array(dimensions).fill(0),factor=algorithm==='random'?Math.sqrt(dimensions/displayDimensions):1
 for(let axis=0;axis<displayDimensions;axis++)for(let k=0;k<dimensions;k++)view[k]+=frame.basis[axis][k]*delta[axis]/factor
 const hidden=orthogonal(identity(sliceAxis,dimensions),frame.basis.slice(0,displayDimensions))
 if(hidden)for(let k=0;k<dimensions;k++)view[k]+=hidden[k]*delta[3]
 return rotateND(view,angles,true)
}
