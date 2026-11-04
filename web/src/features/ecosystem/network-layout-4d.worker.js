import {retainLayoutNodes} from './progressive-graph.js'
import {createNetworkND} from './particle-life-4d.js'
let generation=0
let simulation,nodes=[],timer,enabled=false,dimensions=4
function send(){const data=new Float64Array(nodes.length*dimensions*2);nodes.forEach((n,i)=>data.set([...n.q,...n.velocityND],i*dimensions*2));postMessage({generation,positions:data},[data.buffer])}
function step(){timer=undefined;if(!enabled)return;simulation.tick();send();timer=setTimeout(step,1000/30)}
onmessage=({data})=>{clearTimeout(timer);if((data.type==='graph'||data.type==='update')){generation=data.generation;nodes=retainLayoutNodes(nodes,data.nodes);dimensions=data.options.dimensions;if(data.type==='update')simulation.update(nodes,data.edges);else simulation=createNetworkND(nodes,data.edges,data.options);enabled=data.enabled;send()}else if(data.type==='motion')enabled=data.enabled;if(enabled)timer=setTimeout(step,0)}
