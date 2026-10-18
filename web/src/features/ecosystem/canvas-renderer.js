// The default graph uses batched 2D paths: no per-edge GPU meshes or raycast tubes.
import { curvePoints } from './webgpu-renderer.js'
const cssColor = color => typeof color === 'string' ? color : `#${color.toString(16).padStart(6, '0')}`
export function createNetworkCanvas(canvas) {
 const context = canvas.getContext('2d')
 if (!context) throw new Error('The network canvas is unavailable.')
 const edgePaths=new Map(),nodePaths=new Map()
 let strokes = [], arrows = [], disks = [], disposed = false
 const circle = (path, x, y, radius) => { path.moveTo(x + radius, y); path.arc(x, y, radius, 0, Math.PI * 2) }
 return {
  update(nodes, edges, visible, visibleEdges, selected, colors, edgeColor,updated=null) {
   if(!updated){edgePaths.clear();nodePaths.clear()}
   for(const edge of edges){
    if(!visibleEdges.has(edge.id)||(updated&&!updated.has(edge.source.id)&&!updated.has(edge.target.id)))continue
    const points=curvePoints(edge),color=cssColor(edgeColor(edge)),width=edge.quantityWidth||1.4
    const dash=edge.relationship==='funding'?[]:edge.relationship==='affiliation'?[8,5]:[3,5]
    const path=new Path2D(),head=new Path2D()
    path.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))path.lineTo(p.x,p.y)
    const a=points.at(-2),b=points.at(-1),length=Math.hypot(b.x-a.x,b.y-a.y)||1,ux=(b.x-a.x)/length,uy=(b.y-a.y)/length
    head.moveTo(b.x,b.y);head.lineTo(b.x-ux*8-uy*4,b.y-uy*8+ux*4);head.lineTo(b.x-ux*8+uy*4,b.y-uy*8-ux*4);head.closePath()
    edgePaths.set(edge.id,{key:`${color}|${width}|${dash.join(',')}`,path,head,color,width,dash})
   }
   for(const n of nodes){
    if(!visible.has(n.id)||(updated&&!updated.has(n.id)))continue
    const color=cssColor(n.id===selected?0xe56d3c:colors[n.category]??0x77878c),path=new Path2D(),pieces=[[color,path]]
    circle(path,n.x,n.y,n.renderRadius+(n.financialPie?n.id===selected?2:1:0))
    for(const slice of n.financialPie?.slices||[]){const path=new Path2D();path.moveTo(n.x,n.y);path.arc(n.x,n.y,n.renderRadius,slice.startAngle,slice.endAngle);path.closePath();pieces.push([slice.color,path])}
    nodePaths.set(n.id,pieces)
   }
   const batches=new Map(),heads=new Map(),fills=new Map()
   for(const entry of edgePaths.values()){
    if(!batches.has(entry.key))batches.set(entry.key,{...entry,path:new Path2D()})
    batches.get(entry.key).path.addPath(entry.path)
    if(!heads.has(entry.color))heads.set(entry.color,new Path2D());heads.get(entry.color).addPath(entry.head)
   }
   for(const pieces of nodePaths.values())for(const [color,path] of pieces){if(!fills.has(color))fills.set(color,new Path2D());fills.get(color).addPath(path)}
   strokes=[...batches.values()];arrows=[...heads];disks=[...fills]
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
  dispose() { edgePaths.clear();nodePaths.clear();disposed=true; strokes=[]; arrows=[]; disks=[]; canvas.width=canvas.height=1 },
 }
}

