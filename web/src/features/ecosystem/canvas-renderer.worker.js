import { createNetworkCanvas } from './canvas-renderer.js'
let renderer,graph,byId
onmessage = ({data}) => {
 if (data.canvas) renderer=createNetworkCanvas(data.canvas)
 else {
  if(data.size)renderer.resize(...data.size)
  if(data.graph){graph=data.graph;byId=new Map(graph.nodes.map(n=>[n.id,n]));for(const e of graph.edges){e.source=byId.get(e.sourceId);e.target=byId.get(e.targetId)}}
  for(const patch of data.positions||[]){const n=byId?.get(patch.id);if(n)Object.assign(n,patch)}
  if(graph&&(data.graph||data.positions?.length)){const {nodes,edges,selected,colors}=graph;renderer.update(nodes,edges,new Set(nodes.map(n=>n.id)),new Set(edges.map(e=>e.id)),selected,colors,edge=>edge.color,data.graph?null:new Set(data.positions.map(n=>n.id)))}
  renderer.render(data.view)
 }
 postMessage('ready')
}
