import { createNetworkCanvas } from './canvas-renderer.js'
let renderer
onmessage = ({data}) => {
 if (data.canvas) renderer=createNetworkCanvas(data.canvas)
 else {
  if(data.size)renderer.resize(...data.size)
  if(data.graph){const {nodes,edges,selected,colors}=data.graph;renderer.update(nodes,edges,new Set(nodes.map(n=>n.id)),new Set(edges.map(e=>e.id)),selected,colors,edge=>edge.color)}
  renderer.render(data.view)
 }
 postMessage('ready')
}
