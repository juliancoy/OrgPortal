import {createParticleLife4D} from './particle-life-4d.js'
let simulation,nodes=[],timer,enabled=false
function send(){const data=new Float64Array(nodes.length*8);nodes.forEach((n,i)=>data.set([...n.q,...n.velocity4],i*8));postMessage(data,[data.buffer])}
function step(){timer=undefined;if(!enabled)return;simulation.tick();send();timer=setTimeout(step,1000/30)}
onmessage=({data})=>{clearTimeout(timer);if(data.type==='graph'){nodes=data.nodes;simulation=createParticleLife4D(nodes,data.options);enabled=data.enabled;send()}else if(data.type==='motion')enabled=data.enabled;if(enabled)timer=setTimeout(step,0)}
