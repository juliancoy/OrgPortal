import {BufferGeometry,Float32BufferAttribute,LineBasicMaterial,LineSegments,Color} from 'three/webgpu'
import {createNetworkGPU3D} from './webgpu-3d-renderer.js'
import {project4D} from './particle-life-4d.js'
import {persistNetworkSettings} from './network-settings.js'

const axes=['X','Y','Z'],axisColors=['#f67d75','#62d8a0','#75baff'],layers=[-200,-100,0,100,200],spacing=50,extent=100
export function practiceGrid(){
 const segments=[],labels=[]
 for(const w of layers)for(let axis=0;axis<3;axis++){
  for(let a=-extent;a<=extent;a+=spacing)for(let b=-extent;b<=extent;b+=spacing){
   const from=[0,0,0,w],to=[0,0,0,w],other=[0,1,2].filter(i=>i!==axis)
   from[axis]=-extent;to[axis]=extent;from[other[0]]=to[other[0]]=a;from[other[1]]=to[other[1]]=b
   segments.push({from,to,axis,w})
  }
 }
 for(let axis=0;axis<3;axis++)for(let value=-extent;value<=extent;value+=spacing){
  if(value===0&&axis!==0)continue
  const point=[0,0,0,0];point[axis]=value
  labels.push({text:`${axes[axis]} ${value>0?'+':''}${value}`,point,color:axisColors[axis]})
 }
 for(const w of layers)labels.push({text:`W ${w>0?'+':''}${w}`,point:[115,115,-100,w],color:'#d4b1ff'})
 return {segments,labels}
}

export function mountNavigationPractice(root){
 const abort=new AbortController();let disposed=false,renderer,frame=0,position4=[0,0,0,0],projectionDirty=true
 root.innerHTML=`<header class="eco-network-heading"><h1>4D navigation practice</h1><nav><button type="button" data-practice-exit>Return to graph</button></nav></header>
 <div class="eco-practice-shell"><section class="eco-practice-view" aria-label="Measured four-dimensional practice grid">
 <canvas aria-label="4D practice grid"></canvas><div class="eco-practice-labels" aria-hidden="true"></div>
 <dl class="eco-practice-position" aria-label="Camera position">${[...axes,'W'].map(axis=>`<div><dt>${axis}</dt><dd><output data-coordinate="${axis}">0.0</output></dd></div>`).join('')}</dl>
 <p class="eco-practice-status" role="status">Preparing practice grid…</p></section>
 <aside class="eco-network-controls eco-practice-controls"><h2>Navigation practice</h2>
 <p>Drag to look. W/S move forward/backward, A/D move left/right. E/Q travel along W, the fourth dimension. Hold Shift for 10× speed.</p>
 <label>Camera movement speed <output id="camera-speed-value">1.0</output>×<input id="camera-speed" type="range" min="0.1" max="10" step="0.1" value="1"></label>
 <h3>Grid measurements</h3><p>XYZ grid: −100 to +100, spaced every 50 units. W layers: −200 to +200, spaced every 100 units.</p>
 <ul class="eco-practice-key">${axes.map((axis,i)=>`<li style="--axis-color:${axisColors[i]}">${axis} axis</li>`).join('')}<li style="--axis-color:#d4b1ff">W depth layers</li></ul>
 <div class="eco-practice-gradient" aria-label="W depth gradient from minus 200 to plus 200"></div><div class="eco-practice-scale"><span>W −200</span><span>0</span><span>+200</span></div>
 <p>The colored layers are projections of the same grid at different W coordinates. They spread or contract as you move through W. All four camera coordinates use grid units, relative to the starting viewpoint. Layers disappear when they cross the 4D near plane.</p>
 <div class="eco-practice-actions"><button type="button" data-w-step="-50">−W (Q)</button><button type="button" data-w-step="50">+W (E)</button><button type="button" data-reset-practice>Reset position</button><button type="button" data-practice-exit>Return to graph</button></div>
 </aside></div>`
 const $=selector=>root.querySelector(selector),canvas=$('canvas'),view=$('.eco-practice-view'),status=$('.eco-practice-status')
 persistNetworkSettings(root,abort.signal)
 $('#camera-speed').addEventListener('input',()=>{$('#camera-speed-value').textContent=Number($('#camera-speed').value).toFixed(1)},{signal:abort.signal})
 const {segments,labels}=practiceGrid(),geometry=new BufferGeometry(),positions=new Float32Array(segments.length*6),colors=new Float32Array(segments.length*6)
 geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('color',new Float32BufferAttribute(colors,3))
 const material=new LineBasicMaterial({vertexColors:true,transparent:true,opacity:.65}),grid=new LineSegments(geometry,material);grid.frustumCulled=false
 const labelItems=labels.map(label=>{const element=document.createElement('span');element.textContent=label.text;element.style.color=label.color;$('.eco-practice-labels').append(element);return {...label,element}})
 const color=new Color(),layerColor=new Color()
 function requestRender(){if(!disposed&&!frame)frame=requestAnimationFrame(render)}
 function render(){
  frame=0;if(!renderer||disposed)return
  if(projectionDirty){
   projectionDirty=false
   segments.forEach((segment,index)=>{
    const points=[segment.from,segment.to];layerColor.setHSL((segment.w+200)/400*.65+.05,.65,.55)
    points.forEach((point,end)=>{
     geometry.attributes.position.array.set(project4D(point,[0,0,0],.5,200,position4)||[0,0,0],index*6+end*3)
     color.set(axisColors[segment.axis]).lerp(layerColor,.35).multiplyScalar((end ? .95 : .5)/(1+Math.abs(segment.w-position4[3])/400))
     color.toArray(geometry.attributes.color.array,index*6+end*3)
    })
   })
   geometry.attributes.position.needsUpdate=true;geometry.attributes.color.needsUpdate=true
  }
  const position=Object.fromEntries(axes.map((axis,i)=>[axis.toLowerCase(),position4[i]]))
  for(const axis of axes)$(`[data-coordinate="${axis}"]`).textContent=position[axis.toLowerCase()].toFixed(1)
  $('[data-coordinate="W"]').textContent=position4[3].toFixed(1)
  renderer.render()
  for(const label of labelItems){const p=project4D(label.point,[0,0,0],.5,200,position4),screen=p?renderer.project({x:p[0],y:p[1],z:p[2]}):{visible:false};label.element.hidden=!screen.visible;if(screen.visible)label.element.style.transform=`translate(${screen.x}px,${screen.y}px) translate(-50%,-50%)`}
 }
 function reset(){position4=[0,0,0,0];projectionDirty=true;renderer?.fit([{x:-100,y:-100,z:-100,renderRadius:0},{x:100,y:100,z:100,renderRadius:0}]);requestRender()}
 root.addEventListener('click',event=>{if(event.target.closest('[data-reset-practice]')){reset();canvas.focus({preventScroll:true})}const step=event.target.closest('[data-w-step]');if(step){position4[3]+=Number(step.dataset.wStep);projectionDirty=true;requestRender()}},{signal:abort.signal})
 const resize=()=>{if(renderer){renderer.resize(view.clientWidth,view.clientHeight);requestRender()}},observer=new ResizeObserver(resize);observer.observe(view)
 void createNetworkGPU3D(canvas,message=>{status.textContent=message},requestRender,'4D',()=>Number($('#camera-speed').value),delta=>{position4=position4.map((v,i)=>v+delta[i]);projectionDirty=true;requestRender()}).then(value=>{
  if(disposed){value.dispose();return}renderer=value;renderer.attach(grid);canvas.dataset.renderer='practice4d';canvas.dataset.backend=renderer.backend;reset();resize();status.textContent='Click or Tab to the grid to begin. Coordinates are in grid units, relative to the starting viewpoint.'
 }).catch(error=>{if(!disposed)status.textContent=error.message||'Practice graphics could not start.'})
 return ()=>{disposed=true;abort.abort();observer.disconnect();cancelAnimationFrame(frame);renderer?.dispose();geometry.dispose();material.dispose();root.replaceChildren()}
}
