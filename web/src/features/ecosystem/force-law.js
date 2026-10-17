import {quadtree} from 'd3-quadtree'
import {octree} from 'd3-octree'

// Normalize distance to a reference radius and bound extreme exponents.
export function lawMagnitude(distance,law='power',alpha=1){
 const r=Math.max(0,distance)
 return Math.min(20,law==='linear'?alpha*r:Math.pow(r,alpha))
}

// Barnes-Hut aggregation keeps the configurable law practical on large graphs.
export function forceDistanceLaw({strength,law='power',exponent=1,reference=100,min=1,max=Infinity,dimensions=2}){
 let nodes=[],random=Math.random
 const axes=['x','y','z'].slice(0,dimensions)
 function force(alpha){
  const tree=dimensions===3?octree(nodes,n=>n.x,n=>n.y,n=>n.z):quadtree(nodes,n=>n.x,n=>n.y)
  tree.visitAfter(cell=>{
   cell.weight=0;cell.center=axes.map(()=>0)
   const add=(point,weight)=>{cell.weight+=weight;axes.forEach((a,k)=>cell.center[k]+=point[k]*weight)}
   if(cell.length){for(const child of cell)if(child?.weight)add(child.center,child.weight)}
   else {let leaf=cell;do{add(axes.map(a=>leaf.data[a]),strength(leaf.data))}while(leaf=leaf.next)}
   if(cell.weight)cell.center=cell.center.map(v=>v/cell.weight)
  })
  for(const n of nodes)tree.visit((cell,...bounds)=>{
   if(!cell.weight)return true
   const delta=axes.map((a,k)=>cell.center[k]-n[a]),distance=Math.hypot(...delta),width=bounds[dimensions]-bounds[0]
   const apply=(point,weight)=>{let d=axes.map((a,k)=>point[k]-n[a]),length=Math.hypot(...d);if(length>max)return;if(length<1e-6){d=axes.map(()=>random()-.5);length=Math.hypot(...d)||1}const magnitude=weight*alpha/reference*lawMagnitude(Math.max(min,length)/reference,law,exponent);axes.forEach((a,k)=>{n['v'+a]+=d[k]/length*magnitude})}
   if(cell.length){
    // Never approximate a cell intersecting the repulsion cutoff or containing n.
    const contains=axes.every((a,k)=>n[a]>=bounds[k]&&n[a]<bounds[k+dimensions])
    if(!contains&&width/distance<.7&&distance+Math.sqrt(dimensions)*width<max){apply(cell.center,cell.weight);return true}
    if(distance-Math.sqrt(dimensions)*width>max)return true
    return false
   }
   let leaf=cell;do{if(leaf.data!==n)apply(axes.map(a=>leaf.data[a]),strength(leaf.data))}while(leaf=leaf.next)
   return true
  })
 }
 force.initialize=(next,source)=>{nodes=next;random=source||Math.random}
 return force
}
