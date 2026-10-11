// The default graph uses batched 2D paths: no per-edge GPU meshes or raycast tubes.
import { curvePoints } from './webgpu-renderer.js'
const cssColor = color => typeof color === 'string' ? color : `#${color.toString(16).padStart(6, '0')}`
export function createNetworkCanvas(canvas) {
 const context = canvas.getContext('2d')
 if (!context) throw new Error('The network canvas is unavailable.')
 let strokes = [], arrows = [], disks = [], disposed = false
 const circle = (path, x, y, radius) => { path.moveTo(x + radius, y); path.arc(x, y, radius, 0, Math.PI * 2) }
 return {
  update(nodes, edges, visible, visibleEdges, selected, colors, edgeColor) {
   const batches = new Map(), heads = new Map(), fills = new Map()
   for (const edge of edges) {
    if (!visibleEdges.has(edge.id)) continue
    const points = curvePoints(edge), color = cssColor(edgeColor(edge)), width = edge.quantityWidth || 1.4
    const dash = edge.relationship === 'funding' ? [] : edge.relationship === 'affiliation' ? [8, 5] : [3, 5]
    const key = `${color}|${width}|${dash.join(',')}`
    if (!batches.has(key)) batches.set(key, { path: new Path2D(), color, width, dash })
    const path = batches.get(key).path
    path.moveTo(points[0].x, points[0].y)
    for (const point of points.slice(1)) path.lineTo(point.x, point.y)
    if (!heads.has(color)) heads.set(color, new Path2D())
    const head = heads.get(color), a = points.at(-2), b = points.at(-1), length = Math.hypot(b.x-a.x, b.y-a.y) || 1
    const ux = (b.x-a.x)/length, uy = (b.y-a.y)/length
    head.moveTo(b.x, b.y); head.lineTo(b.x-ux*8-uy*4, b.y-uy*8+ux*4); head.lineTo(b.x-ux*8+uy*4, b.y-uy*8-ux*4); head.closePath()
   }
   const fill = color => { if (!fills.has(color)) fills.set(color, new Path2D()); return fills.get(color) }
   for (const node of nodes) {
    if (!visible.has(node.id)) continue
    const color = cssColor(node.id === selected ? 0xe56d3c : colors[node.category] ?? 0x77878c)
    circle(fill(color), node.x, node.y, node.renderRadius + (node.financialPie ? node.id === selected ? 2 : 1 : 0))
    for (const slice of node.financialPie?.slices || []) {
     const path = fill(slice.color)
     path.moveTo(node.x, node.y); path.arc(node.x, node.y, node.renderRadius, slice.startAngle, slice.endAngle); path.closePath()
    }
   }
   strokes = [...batches.values()]; arrows = [...heads]; disks = [...fills]
  },
  render(view) {
   if (disposed) return
   context.resetTransform(); context.clearRect(0, 0, canvas.width, canvas.height)
   context.setTransform(canvas.width/view.w, 0, 0, canvas.height/view.h, -view.x*canvas.width/view.w, -view.y*canvas.height/view.h)
   context.globalAlpha = .65
   for (const {path, color, width, dash} of strokes) { context.strokeStyle=color; context.lineWidth=width; context.setLineDash(dash); context.stroke(path) }
   context.setLineDash([])
   for (const [color, path] of arrows) { context.fillStyle=color; context.fill(path) }
   context.globalAlpha = 1
   for (const [color, path] of disks) { context.fillStyle=color; context.fill(path) }
  },
  resize(width, height, pixelRatio = 1) {
   // Bound backing-store pixels even on tall/high-DPI viewports.
   const ratio = Math.min(pixelRatio, 1.5, Math.sqrt(2_000_000 / Math.max(1, width*height)))
   const w = Math.max(1, Math.round(width*ratio)), h = Math.max(1, Math.round(height*ratio))
   if (canvas.width !== w) canvas.width=w
   if (canvas.height !== h) canvas.height=h
  },
  dispose() { disposed=true; strokes=[]; arrows=[]; disks=[]; canvas.width=canvas.height=1 },
 }
}

