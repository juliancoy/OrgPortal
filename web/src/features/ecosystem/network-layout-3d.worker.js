import {layoutNetwork3D} from './ecosystem-physics-3d.js'
let simulation,nodes=[],timer,enabled=false
function send(){const positions=new Float64Array(nodes.length*6);nodes.forEach((n,i)=>positions.set([n.x,n.y,n.z,n.vx,n.vy,n.vz],i*6));postMessage(positions,[positions.buffer])}
function step(){timer=undefined;if(!enabled||!simulation||simulation.alpha()<=simulation.alphaMin())return;simulation.tick();send();timer=setTimeout(step,1000/30)}
onmessage=({data})=>{
 clearTimeout(timer)
 if(data.type==='graph'){nodes=data.nodes;simulation?.stop();simulation=layoutNetwork3D(nodes,data.edges,data.options);enabled=data.enabled;send()}
 else if(data.type==='motion'){enabled=data.enabled;if(enabled&&data.reheat)simulation?.alpha(Math.max(simulation.alpha(),.15))}
 if(enabled)timer=setTimeout(step,0)
}
