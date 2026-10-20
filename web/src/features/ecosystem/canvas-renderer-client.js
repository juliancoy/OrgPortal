import { createNetworkCanvas } from './canvas-renderer.js'

// Keep rasterization off the UI thread too. At most one paint is in flight;
// while it runs, retain only the latest graph and viewport rather than a queue.
export function createNetworkCanvasWorker(canvas,onPaint=()=>{}) {
 if (!canvas.transferControlToOffscreen){const renderer=createNetworkCanvas(canvas),render=renderer.render;renderer.render=view=>{render(view);onPaint()};return renderer}
 const worker=new Worker(new URL('./canvas-renderer.worker.js',import.meta.url),{type:'module'})
 let busy=true,disposed=false,graph=null,view=null,size=null,inFlight=false
 const patches=new Map()
 const flush=()=>{
  if(busy||disposed||!view)return
  busy=true;inFlight=true
  worker.postMessage({graph,positions:[...patches.values()],view,size});patches.clear();graph=null;view=null;size=null
 }
 worker.onmessage=()=>{if(inFlight)onPaint();inFlight=false;busy=false;flush()}
 const surface=canvas.transferControlToOffscreen()
 worker.postMessage({canvas:surface},[surface])
 return {
  update(nodes,edges,visible,visibleEdges,selected,colors,edgeColor,updated=null){
   if(updated){for(const n of nodes)if(updated.has(n.id))patches.set(n.id,{id:n.id,x:n.x,y:n.y});return}
   patches.clear()
   const point=({x,y,renderRadius})=>({x,y,renderRadius})
   graph={selected,colors,nodes:nodes.filter(n=>visible.has(n.id)).map(n=>({id:n.id,category:n.category,opacity:n.opacity,...point(n),financialPie:n.financialPie?{slices:n.financialPie.slices.map(({startAngle,endAngle,color})=>({startAngle,endAngle,color}))}:null})),edges:edges.filter(e=>visibleEdges.has(e.id)).map(e=>({id:e.id,sourceId:e.source.id,targetId:e.target.id,curveOffset:e.curveOffset,relationship:e.relationship,quantityWidth:e.quantityWidth,opacity:e.opacity,directional:e.directional,color:edgeColor(e)}))}
  },
  render(next){view={...next};flush()},
  resize(width,height){size=[width,height,devicePixelRatio]},
  dispose(){disposed=true;worker.terminate();graph=view=size=null},
 }
}
