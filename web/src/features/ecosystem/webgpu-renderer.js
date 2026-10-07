// Native WebGPU: one instanced draw for circles/pie sectors and one batched draw for links.
const shader = `
struct View { rect: vec4f }
@group(0) @binding(0) var<uniform> view: View;
struct Out { @builtin(position) position: vec4f, @location(0) local: vec2f,
 @location(1) color: vec4f, @location(2) @interpolate(flat) angles: vec2f }
fn project(p: vec2f) -> vec4f { let q=(p-view.rect.xy)/view.rect.zw; return vec4f(q.x*2-1,1-q.y*2,0,1); }
@vertex fn circle(@builtin(vertex_index) i: u32, @location(0) center: vec2f,
 @location(1) radius: f32, @location(2) angles: vec2f, @location(3) color: vec4f) -> Out {
 let corners=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));
 var o: Out; o.local=corners[i]; o.position=project(center+o.local*radius);o.color=color;o.angles=angles;return o;
}
@fragment fn disk(o: Out) -> @location(0) vec4f {
 let d=length(o.local);let aa=fwidth(d);if(d>1){discard;}
 let angle=atan2(o.local.y,o.local.x)+1.570796327;let a=select(angle,angle+6.283185307,angle<0);
 if(a<o.angles.x || a>o.angles.y){discard;}
 return vec4f(o.color.rgb,o.color.a*(1-smoothstep(1-aa,1,d)));
}
@vertex fn line(@location(0) p: vec2f, @location(1) color: vec4f) -> Out {
 var o: Out;o.position=project(p);o.local=vec2f(0);o.color=color;o.angles=vec2f(0);return o;
}
@fragment fn solid(o: Out) -> @location(0) vec4f {return o.color;}
`
const colorCache=new Map()
const rgba=(color,alpha=1)=>{
 let rgb=colorCache.get(color)
 if(!rgb){
  const hsl=typeof color==='string'&&color.match(/^hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)$/)
  if(hsl){const h=Number(hsl[1])/30,s=Number(hsl[2])/100,l=Number(hsl[3])/100,a=s*Math.min(l,1-l);rgb=[0,8,4].map(n=>{const k=(n+h)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1))})}
  else {const n=typeof color==='string'?parseInt(color.replace('#',''),16):color;rgb=[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]}
  colorCache.set(color,rgb)
 }return [...rgb,alpha]
}
export function curvePoints(edge) {
 const a=edge.source,b=edge.target,dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d
 const start={x:a.x+ux*(a.renderRadius+2),y:a.y+uy*(a.renderRadius+2)}
 const end={x:b.x-ux*(b.renderRadius+3),y:b.y-uy*(b.renderRadius+3)}
 const mid={x:(start.x+end.x)/2-uy*edge.curveOffset,y:(start.y+end.y)/2+ux*edge.curveOffset}
 return Array.from({length:19},(_,i)=>{const t=i/18,s=1-t;return {x:s*s*start.x+2*s*t*mid.x+t*t*end.x,y:s*s*start.y+2*s*t*mid.y+t*t*end.y}})
}
export async function createNetworkGPU(canvas,onLost) {
 if(!navigator.gpu)throw new Error('WebGPU requires a supported browser and a secure connection.')
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw new Error('No WebGPU adapter is available in this browser.')
 const device=await adapter.requestDevice(),context=canvas.getContext('webgpu');if(!context){device.destroy();throw new Error('WebGPU canvas unavailable.')}
 let disposed=false
 device.lost.then(info=>{if(!disposed)onLost(info.message)})
 device.addEventListener('uncapturederror',event=>{if(!disposed)onLost(event.error.message)})
 const format=navigator.gpu.getPreferredCanvasFormat();context.configure({device,format,alphaMode:'premultiplied'})
 device.pushErrorScope('validation')
 const module=device.createShaderModule({code:shader}),blend={color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}
 const target={format,blend},uniform=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})
 const layout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:'uniform'}}]})
 const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]})
 let circles,lines
 try {
 circles=await device.createRenderPipelineAsync({layout:pipelineLayout,vertex:{module,entryPoint:'circle',buffers:[{arrayStride:36,stepMode:'instance',attributes:[{shaderLocation:0,offset:0,format:'float32x2'},{shaderLocation:1,offset:8,format:'float32'},{shaderLocation:2,offset:12,format:'float32x2'},{shaderLocation:3,offset:20,format:'float32x4'}]}]},fragment:{module,entryPoint:'disk',targets:[target]}})
 lines=await device.createRenderPipelineAsync({layout:pipelineLayout,vertex:{module,entryPoint:'line',buffers:[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:'float32x2'},{shaderLocation:1,offset:8,format:'float32x4'}]}]},fragment:{module,entryPoint:'solid',targets:[target]}})
 const error=await device.popErrorScope();if(error)throw new Error(error.message)
 }catch(error){disposed=true;context.unconfigure();uniform.destroy();device.destroy();throw error}
 const bind=device.createBindGroup({layout,entries:[{binding:0,resource:{buffer:uniform}}]})
 let nodeBuffer,edgeBuffer,nodeCount=0,edgeCount=0
 const upload=(old,values)=>{const array=new Float32Array(values);if(!old||old.size<array.byteLength){old?.destroy();old=device.createBuffer({size:Math.max(256,2**Math.ceil(Math.log2(array.byteLength||1))),usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST})}if(array.length)device.queue.writeBuffer(old,0,array);return old}
 return {
  update(nodes,edges,visible,visibleEdges,selected,colors,edgeColor){
   const disks=[],vertices=[]
   const vertex=(p,color)=>vertices.push(p.x,p.y,...color)
   for(const e of edges){if(!visibleEdges.has(e.id))continue;const points=curvePoints(e),color=rgba(edgeColor(e),.65),width=(e.quantityWidth||1.4)/2
    for(let i=1;i<points.length;i++){if(e.relationship!=='funding'&&i%(e.relationship==='affiliation'?4:2)===0)continue;const a=points[i-1],b=points[i],d=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/d*width,ny=(b.x-a.x)/d*width
     const p={x:a.x+nx,y:a.y+ny},q={x:a.x-nx,y:a.y-ny},r={x:b.x+nx,y:b.y+ny},s={x:b.x-nx,y:b.y-ny};for(const v of [p,q,r,r,q,s])vertex(v,color)
    }
    const a=points.at(-2),b=points.at(-1),d=Math.hypot(b.x-a.x,b.y-a.y)||1,ux=(b.x-a.x)/d,uy=(b.y-a.y)/d
    for(const p of [b,{x:b.x-ux*8-uy*4,y:b.y-uy*8+ux*4},{x:b.x-ux*8+uy*4,y:b.y-uy*8-ux*4}])vertex(p,color)
   }
   for(const n of nodes){if(!visible.has(n.id))continue;const color=n.id===selected?0xe56d3c:colors[n.category]??0x77878c
    disks.push(n.x,n.y,n.renderRadius+(n.financialPie?(n.id===selected?2:1):0),0,Math.PI*2,...rgba(color))
    for(const slice of n.financialPie?.slices||[])disks.push(n.x,n.y,n.renderRadius,slice.startAngle+Math.PI/2,slice.endAngle+Math.PI/2,...rgba(slice.color))
   }
   nodeBuffer=upload(nodeBuffer,disks);edgeBuffer=upload(edgeBuffer,vertices);nodeCount=disks.length/9;edgeCount=vertices.length/6
  },
  render(view){if(disposed)return;device.queue.writeBuffer(uniform,0,new Float32Array([view.x,view.y,view.w,view.h]));const encoder=device.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});pass.setBindGroup(0,bind)
   if(edgeCount){pass.setPipeline(lines);pass.setVertexBuffer(0,edgeBuffer);pass.draw(edgeCount)}if(nodeCount){pass.setPipeline(circles);pass.setVertexBuffer(0,nodeBuffer);pass.draw(6,nodeCount)}pass.end();device.queue.submit([encoder.finish()])
  },
  resize(width,height){const dpr=Math.min(devicePixelRatio,2);const w=Math.max(1,Math.min(device.limits.maxTextureDimension2D,Math.round(width*dpr))),h=Math.max(1,Math.min(device.limits.maxTextureDimension2D,Math.round(height*dpr)));if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h},
  dispose(){disposed=true;nodeBuffer?.destroy();edgeBuffer?.destroy();uniform.destroy();context.unconfigure();device.destroy()},
 }
}
