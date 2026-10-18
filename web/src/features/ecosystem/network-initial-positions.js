// Identical deterministic seeds for generated snapshots and newly discovered nodes.
export function initializeNetworkPositions(nodes,dimensions=2){
 nodes.forEach((node,i)=>{
  if(!Number.isFinite(node.x)||!Number.isFinite(node.y)){
   const radius=10*Math.sqrt(.5+i),angle=i*Math.PI*(3-Math.sqrt(5))
   node.x=radius*Math.cos(angle);node.y=radius*Math.sin(angle)
  }
  if(dimensions>=3&&!Number.isFinite(node.z)){
   const r=80*Math.cbrt(i+.5),z=1-2*(i+.5)/Math.max(1,nodes.length),angle=i*Math.PI*(3-Math.sqrt(5))
   node.x=r*Math.sqrt(1-z*z)*Math.cos(angle);node.y=r*Math.sqrt(1-z*z)*Math.sin(angle);node.z=r*z
  }
  node.vx ||= 0;node.vy ||= 0;if(dimensions>=3)node.vz ||= 0
 })
}
