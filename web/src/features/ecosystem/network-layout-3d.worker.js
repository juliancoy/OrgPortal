import {retainLayoutNodes} from './progressive-graph.js'
import {layoutNetwork3D} from './ecosystem-physics-3d.js'
let generation=0
let simulation,nodes=[],timer,enabled=false
function send(){const positions=new Float64Array(nodes.length*6);nodes.forEach((n,i)=>positions.set([n.x,n.y,n.z,n.vx,n.vy,n.vz],i*6));postMessage({generation,positions},[positions.buffer])}
function step(){timer=undefined;if(!enabled||!simulation||simulation.alpha()<=simulation.alphaMin())return;const started=performance.now();simulation.tick();send();timer=setTimeout(step,Math.max(0,1000/30-(performance.now()-started)))}
onmessage=({data})=>{
 clearTimeout(timer)
 if((data.type==='graph'||data.type==='update')){generation=data.generation;nodes=retainLayoutNodes(nodes,data.nodes);simulation?.stop();simulation=layoutNetwork3D(nodes,data.edges,{...data.options,existingSimulation:data.type==='update'?simulation:undefined});enabled=data.enabled;send()}
 else if(data.type==='motion'){enabled=data.enabled;if(enabled&&data.reheat)simulation?.alpha(Math.max(simulation.alpha(),.15))}
 if(enabled)timer=setTimeout(step,0)
}
