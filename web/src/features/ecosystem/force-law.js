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
 function force(alpha){
  const spatial=dimensions===3
  const tree=spatial?octree(nodes,n=>n.x,n=>n.y,n=>n.z):quadtree(nodes,n=>n.x,n=>n.y)
  tree.visitAfter(cell=>{
   let weight=0,x=0,y=0,z=0
   if(cell.length){for(const child of cell)if(child?.weight){weight+=child.weight;x+=child.cx*child.weight;y+=child.cy*child.weight;z+=child.cz*child.weight}}
   else {let leaf=cell;do{const n=leaf.data,w=strength(n);weight+=w;x+=n.x*w;y+=n.y*w;if(spatial)z+=n.z*w}while(leaf=leaf.next)}
   cell.weight=weight;cell.cx=weight?x/weight:0;cell.cy=weight?y/weight:0;cell.cz=weight?z/weight:0
  })
  const factor=alpha/reference,diagonal=Math.sqrt(dimensions)
  for(const n of nodes){
   const apply=(x,y,z,weight)=>{
    let dx=x-n.x,dy=y-n.y,dz=spatial?z-n.z:0,length=Math.sqrt(dx*dx+dy*dy+dz*dz)
    if(length>max)return
    if(length<1e-6){dx=random()-.5;dy=random()-.5;dz=spatial?random()-.5:0;length=Math.sqrt(dx*dx+dy*dy+dz*dz)||1}
    const magnitude=weight*factor*lawMagnitude(Math.max(min,length)/reference,law,exponent)/length
    n.vx+=dx*magnitude;n.vy+=dy*magnitude;if(spatial)n.vz+=dz*magnitude
   }
   tree.visit((cell,x0,y0,a,b,c,d)=>{
    if(!cell.weight)return true
    const x1=spatial?b:a,y1=spatial?c:b,z0=spatial?a:0,z1=spatial?d:0
    const dx=cell.cx-n.x,dy=cell.cy-n.y,dz=spatial?cell.cz-n.z:0,distance=Math.sqrt(dx*dx+dy*dy+dz*dz),width=x1-x0
    if(cell.length){
     // Keep the cutoff and self-exclusion exact; approximate only distant cells.
     const contains=n.x>=x0&&n.x<x1&&n.y>=y0&&n.y<y1&&(!spatial||(n.z>=z0&&n.z<z1))
     if(!contains&&width/distance<.7&&distance+diagonal*width<max){apply(cell.cx,cell.cy,cell.cz,cell.weight);return true}
     if(distance-diagonal*width>max)return true
     return false
    }
    let leaf=cell;do{const other=leaf.data;if(other!==n)apply(other.x,other.y,other.z,strength(other))}while(leaf=leaf.next)
    return true
   })
  }
 }
 force.initialize=(next,source)=>{nodes=next;random=source||Math.random}
 return force
}
