import { layoutNetwork } from './ecosystem-physics.js'
let simulation, nodes = [], timer, enabled = false
function step() {
 timer = undefined
 if (!enabled || !simulation || simulation.alpha() <= simulation.alphaMin()) return
 simulation.tick()
 const positions = new Float64Array(nodes.length * 4)
 nodes.forEach((node, i) => positions.set([node.x, node.y, node.vx, node.vy], i * 4))
 postMessage(positions, [positions.buffer])
 timer = setTimeout(step, 1000 / 30)
}
onmessage = ({ data }) => {
 if (data.type === 'graph') {
  clearTimeout(timer); nodes = data.nodes
  simulation?.stop()
  simulation = layoutNetwork(nodes, data.edges, n => n.renderRadius, () => ({x:0,y:0}), {live:true, ...data.options})
  enabled = data.enabled
  // Supply initial coordinates even when motion is disabled.
  const positions = new Float64Array(nodes.length * 4)
  nodes.forEach((node, i) => positions.set([node.x, node.y, node.vx, node.vy], i * 4))
  postMessage(positions, [positions.buffer])
 } else if (data.type === 'motion') {
  enabled = data.enabled
  if (enabled && data.reheat) simulation?.alpha(Math.max(simulation.alpha(), .15))
 }
 clearTimeout(timer)
 if (enabled) timer = setTimeout(step, 0)
}
