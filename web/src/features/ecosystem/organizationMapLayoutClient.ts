import {organizationMapLayout,type MapPage,type PositionedNode,type OrganizationMapLayoutOptions} from './organizationMap'

// Weak keys follow the already bounded neighborhood cache. Never return the
// cached objects themselves: the renderer mutates positions during transitions.
const layouts=new WeakMap<MapPage,Map<string,PositionedNode[]>>()
export function loadOrganizationMapLayout(data:MapPage,mode:'2d'|'3d',signal:AbortSignal,options:OrganizationMapLayoutOptions={}):Promise<PositionedNode[]>{
 if(signal.aborted)return Promise.reject(new DOMException('Layout cancelled','AbortError'))
 const key=JSON.stringify([mode,options.layout||'radial',options.hubSpacing||1])
 const copy=(nodes:PositionedNode[])=>nodes.map(node=>({...node}))
 const cached=layouts.get(data)?.get(key)
 if(cached)return Promise.resolve(copy(cached))
 const remember=(nodes:PositionedNode[])=>{
  let entry=layouts.get(data);if(!entry){entry=new Map();layouts.set(data,entry)}
  entry.set(key,copy(nodes));return nodes
 }
 // Small neighborhoods finish quickly without worker startup overhead.
 if(data.organizations.length<=120&&options.layout!=='hubs')return Promise.resolve(remember(organizationMapLayout(data,mode,options)))
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./organizationMapLayout.worker.ts',import.meta.url),{type:'module'})
  const stop=()=>{worker.terminate();worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;signal.removeEventListener('abort',cancel)}
  const cancel=()=>{stop();reject(new DOMException('Layout cancelled','AbortError'))}
  signal.addEventListener('abort',cancel,{once:true})
  worker.onmessage=(event:MessageEvent<PositionedNode[]>)=>{stop();if(!signal.aborted)resolve(remember(event.data))}
  worker.onerror=()=>{stop();reject(new Error('Could not arrange the map. Retry the layout.'))}
  worker.onmessageerror=()=>{stop();reject(new Error('Could not read the map layout. Retry the layout.'))}
  try{worker.postMessage({data,mode,...(Object.keys(options).length?{options}:{})})}catch(error){stop();reject(error)}
 })
}
