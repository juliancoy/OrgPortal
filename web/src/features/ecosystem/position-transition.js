// One interpolation fraction for the whole graph, independent of the node budget.
// Start each transition at the last displayed positions, so replacing a target
// cannot teleport nodes or leave connected endpoints on different snapshots.
export function createPositionTransition(nodes){
 let target=null,start=null,started=0,lastArrival=null,duration=1000/30
 return {
  offer(data,now=performance.now()){
   if(lastArrival!==null)duration=Math.max(1000/30,Math.min(250,now-lastArrival))
   lastArrival=now;started=now;target=data
   start=new Float64Array(nodes.length*3)
   nodes.forEach((n,i)=>start.set([n.x,n.y,n.z],i*3))
  },
  pending(){return target!==null},
  consume(now=performance.now()){
   const updated=new Set();if(!target)return updated
   const t=Math.max(0,Math.min(1,(now-started)/duration))
   nodes.forEach((n,i)=>{
    const j=i*6,k=i*3
    n.x=start[k]+(target[j]-start[k])*t;n.y=start[k+1]+(target[j+1]-start[k+1])*t;n.z=start[k+2]+(target[j+2]-start[k+2])*t
    n.vx=target[j+3];n.vy=target[j+4];n.vz=target[j+5];updated.add(n.id)
   })
   if(t===1){target=null;start=null}
   return updated
  },
 }
}
