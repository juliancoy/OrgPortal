import {retainLayoutNodes} from './progressive-graph.js'
import { layoutNetwork } from './ecosystem-physics.js'
let generation=0
let simulation, nodes = [], timer, enabled = false
function step() {
 timer = undefined
 if (!enabled || !simulation || simulation.alpha() <= simulation.alphaMin()) return
 simulation.tick()
 const positions = new Float64Array(nodes.length * 4)
 nodes.forEach((node, i) => positions.set([node.x, node.y, node.vx, node.vy], i * 4))
 postMessage({generation,positions}, [positions.buffer])
 timer = setTimeout(step, 1000 / 30)
}
onmessage = ({ data }) => {
 if ((data.type === 'graph' || data.type === 'update')) {
  clearTimeout(timer); generation=data.generation; nodes = retainLayoutNodes(nodes,data.nodes)
  simulation?.stop()
  simulation = layoutNetwork(nodes, data.edges, n => n.renderRadius, () => ({x:0,y:0}), {live:true, ...data.options,existingSimulation:data.type==='update'?simulation:undefined})
  enabled = data.enabled
  // Supply initial coordinates even when motion is disabled.
  const positions = new Float64Array(nodes.length * 4)
  nodes.forEach((node, i) => positions.set([node.x, node.y, node.vx, node.vy], i * 4))
  postMessage({generation,positions}, [positions.buffer])
 } else if (data.type === 'motion') {
  enabled = data.enabled
  if (enabled && data.reheat) simulation?.alpha(Math.max(simulation.alpha(), .15))
 }
 clearTimeout(timer)
 if (enabled) timer = setTimeout(step, 0)
}
