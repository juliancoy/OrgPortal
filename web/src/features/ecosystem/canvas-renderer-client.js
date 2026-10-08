import { createNetworkCanvas } from './canvas-renderer.js'

// Keep rasterization off the UI thread too. At most one paint is in flight;
// while it runs, retain only the latest graph and viewport rather than a queue.
export function createNetworkCanvasWorker(canvas) {
 if (!canvas.transferControlToOffscreen) return createNetworkCanvas(canvas)
 const worker=new Worker(new URL('./canvas-renderer.worker.js',import.meta.url),{type:'module'})
 let busy=true,disposed=false,graph=null,view=null,size=null
 const flush=()=>{
  if(busy||disposed||!view)return
  busy=true
  worker.postMessage({graph,view,size});graph=null;view=null;size=null
 }
 worker.onmessage=()=>{busy=false;flush()}
 const surface=canvas.transferControlToOffscreen()
 worker.postMessage({canvas:surface},[surface])
 return {
  update(nodes,edges,visible,visibleEdges,selected,colors,edgeColor){
   const point=({x,y,renderRadius})=>({x,y,renderRadius})
   graph={selected,colors,nodes:nodes.filter(n=>visible.has(n.id)).map(n=>({id:n.id,category:n.category,...point(n),financialPie:n.financialPie?{slices:n.financialPie.slices.map(({startAngle,endAngle,color})=>({startAngle,endAngle,color}))}:null})),edges:edges.filter(e=>visibleEdges.has(e.id)).map(e=>({id:e.id,source:point(e.source),target:point(e.target),curveOffset:e.curveOffset,relationship:e.relationship,quantityWidth:e.quantityWidth,color:edgeColor(e)}))}
  },
  render(next){view={...next};flush()},
  resize(width,height){size=[width,height,devicePixelRatio]},
  dispose(){disposed=true;worker.terminate();graph=view=size=null},
 }
}
