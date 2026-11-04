// Separate transaction rows keep separate paths, including in spatial views.
export const TRANSACTION_EDGE_SEGMENTS=8
export function transactionEdgePath(edge){
 const a=edge.source,b=edge.target,dx=b.x-a.x,dy=b.y-a.y,dz=(b.z||0)-(a.z||0)
 const distance=Math.hypot(dx,dy,dz)||1,ux=dx/distance,uy=dy/distance,uz=dz/distance
 const start=Math.min(distance/3,(a.renderRadius||0)+2),end=Math.min(distance/3,(b.renderRadius||0)+6)
 const p={x:a.x+ux*start,y:a.y+uy*start,z:(a.z||0)+uz*start}
 const q={x:b.x-ux*end,y:b.y-uy*end,z:(b.z||0)-uz*end}
 const planar=Math.hypot(dx,dy),sx=planar?-dy/planar:1,sy=planar?dx/planar:0,offset=edge.curveOffset||0
 const control={x:(p.x+q.x)/2+sx*offset,y:(p.y+q.y)/2+sy*offset,z:(p.z+q.z)/2}
 return Array.from({length:TRANSACTION_EDGE_SEGMENTS+1},(_,i)=>{
  const t=i/TRANSACTION_EDGE_SEGMENTS,u=1-t
  return {x:u*u*p.x+2*u*t*control.x+t*t*q.x,y:u*u*p.y+2*u*t*control.y+t*t*q.y,z:u*u*p.z+2*u*t*control.z+t*t*q.z}
 })
}
