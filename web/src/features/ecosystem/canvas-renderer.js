import {edgeArrowGeometry} from './edge-arrows.js'
import {paintSphereTitle,sphereTitleReadable} from './sphere-title-text.js'
// The default graph uses batched 2D paths: no per-edge GPU meshes or raycast tubes.
import { curvePoints } from './webgpu-renderer.js'
const cssColor = color => typeof color === 'string' ? color : `#${color.toString(16).padStart(6, '0')}`
export function createNetworkCanvas(canvas) {
 const context = canvas.getContext('2d')
 if (!context) throw new Error('The network canvas is unavailable.')
 const edgePaths=new Map(),nodePaths=new Map(),surfaceTitles=new Set()
 let cssWidth=1,backingRatio=1
 let strokes = [], arrows = [], disks = [], titles=[], disposed = false
 const circle = (path, x, y, radius) => { path.moveTo(x + radius, y); path.arc(x, y, radius, 0, Math.PI * 2) }
 return {
  update(nodes, edges, visible, visibleEdges, selected, colors, edgeColor,updated=null) {
   titles=nodes.filter(n=>visible.has(n.id)&&n.sphereTitle)
   if(!updated){edgePaths.clear();nodePaths.clear()}
   for(const edge of edges){
    if(!visibleEdges.has(edge.id)||(updated&&!updated.has(edge.source.id)&&!updated.has(edge.target.id)))continue
    const geometry=edgeArrowGeometry(curvePoints(edge),edge.quantityWidth||1.4,edge.directional),points=geometry.shaft,color=cssColor(edgeColor(edge)),width=geometry.width
    const opacity=edge.opacity??.65
    const dash=edge.relationship==='funding'?[]:edge.relationship==='affiliation'?[8,5]:[3,5]
    const path=new Path2D(),head=new Path2D()
    path.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))path.lineTo(p.x,p.y)
    if(geometry.head){const {tip:b,base,direction:{x:ux,y:uy},halfWidth}=geometry.head
     head.moveTo(b.x,b.y);head.lineTo(base.x-uy*halfWidth,base.y+ux*halfWidth);head.lineTo(base.x+uy*halfWidth,base.y-ux*halfWidth);head.closePath()
    }
    edgePaths.set(edge.id,{key:`${color}|${width}|${dash.join(',')}|${opacity}`,path,head,color,width,dash,opacity,directional:!!geometry.head})
   }
   for(const n of nodes){
    if(!visible.has(n.id)||(updated&&!updated.has(n.id)))continue
    const color=cssColor(n.volumeColor??(n.id===selected?0xe56d3c:colors[n.category]??0x77878c))+(n.opacity<1?Math.round(n.opacity*255).toString(16).padStart(2,'0'):''),path=new Path2D(),pieces=[[color,path]]
    if(n.volumeColor!==undefined&&n.id===selected){const outline=new Path2D();circle(outline,n.x,n.y,n.renderRadius+2);pieces.unshift(['#57c7ff',outline])}
    circle(path,n.x,n.y,n.renderRadius+(n.financialPie?n.id===selected?2:1:0))
    for(const slice of n.financialPie?.slices||[]){const path=new Path2D();path.moveTo(n.x,n.y);path.arc(n.x,n.y,n.renderRadius,slice.startAngle,slice.endAngle);path.closePath();pieces.push([slice.color,path])}
    nodePaths.set(n.id,pieces)
   }
   const batches=new Map(),heads=new Map(),fills=new Map()
   for(const entry of edgePaths.values()){
    if(!batches.has(entry.key))batches.set(entry.key,{...entry,path:new Path2D()})
    batches.get(entry.key).path.addPath(entry.path)
    if(entry.directional){const key=entry.color+'|'+entry.opacity;if(!heads.has(key))heads.set(key,{color:entry.color,opacity:entry.opacity,path:new Path2D()});heads.get(key).path.addPath(entry.head)}
   }
   for(const pieces of nodePaths.values())for(const [color,path] of pieces){if(!fills.has(color))fills.set(color,new Path2D());fills.get(color).addPath(path)}
   strokes=[...batches.values()];arrows=[...heads.values()];disks=[...fills]
  },
  render(view) {
   if (disposed) return
   context.resetTransform(); context.clearRect(0, 0, canvas.width, canvas.height)
   context.setTransform(canvas.width/view.w, 0, 0, canvas.height/view.h, -view.x*canvas.width/view.w, -view.y*canvas.height/view.h)
   context.globalAlpha = .65
   for (const {path, color, width, dash, opacity} of strokes) { context.globalAlpha=opacity; context.strokeStyle=color; context.lineWidth=width; context.setLineDash(dash); context.stroke(path) }
   context.setLineDash([])
   for (const {color, path, opacity} of arrows) { context.globalAlpha=Math.max(.55,opacity); context.fillStyle=color; context.fill(path) }
   context.globalAlpha = 1
   for (const [color, path] of disks) { context.fillStyle=color; context.fill(path) }
   surfaceTitles.clear()
   for(const node of titles){
    if(node.x+node.renderRadius<view.x||node.x-node.renderRadius>view.x+view.w||node.y+node.renderRadius<view.y||node.y-node.renderRadius>view.y+view.h||!sphereTitleReadable(node.sphereTitle,node.renderRadius*cssWidth/view.w,false,backingRatio,node.sphereSubtitle))continue
    context.save();context.globalAlpha=node.opacity??1;context.beginPath();context.arc(node.x,node.y,node.renderRadius,0,Math.PI*2);context.clip()
    paintSphereTitle(context,node.sphereTitle,node.x,node.y,node.renderRadius*1.65,node.renderRadius*1.3,node.sphereSubtitle);context.restore();surfaceTitles.add(node.id)
   }
   canvas.dataset.sphereTitles=String(surfaceTitles.size)
  },
  hasSurfaceTitle(id){return surfaceTitles.has(id)},
  resize(width, height, pixelRatio = 1) {
   cssWidth=Math.max(1,width)
   // Keep text and edges at native screen resolution at every viewport size.
   const ratio = Number.isFinite(pixelRatio) ? Math.max(1,pixelRatio) : 1
   backingRatio=ratio
   const w = Math.max(1, Math.round(width*ratio)), h = Math.max(1, Math.round(height*ratio))
   if (canvas.width !== w) canvas.width=w
   if (canvas.height !== h) canvas.height=h
  },
  dispose() { edgePaths.clear();nodePaths.clear();disposed=true; strokes=[]; arrows=[]; disks=[]; titles=[];canvas.width=canvas.height=1 },
 }
}

