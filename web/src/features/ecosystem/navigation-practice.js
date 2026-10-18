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

export function practiceTesseract(){
 const vertices=Array.from({length:16},(_,id)=>Array.from({length:4},(_,axis)=>id&(1<<axis)?100:-100))
 const segments=[]
 vertices.forEach((from,id)=>{for(let axis=0;axis<4;axis++)if(!(id&(1<<axis)))segments.push({from,to:vertices[id|(1<<axis)],axis,w:from[3]})})
 return {segments,labels:vertices.map((point,id)=>({point,text:`V${id} (${point.join(', ')})`,color:'#e2d2ff'}))}
}
export function transformPracticePoint(point,plane,angle,wScale){
 const p=[...point];p[3]*=wScale
 const radians=angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians),v=p[plane]
 p[plane]=c*v-s*p[3];p[3]=s*v+c*p[3]
 return p
}

export function mountNavigationPractice(root){
 const abort=new AbortController();let disposed=false,renderer,frame=0,position4=[0,0,0,0],projectionDirty=true,angle=0,wScale=1,lastTime=0
 root.innerHTML=`<header class="eco-network-heading"><h1>4D navigation practice</h1><nav><button type="button" data-practice-exit>Return to graph</button></nav></header>
 <div class="eco-practice-shell"><section class="eco-practice-view" aria-label="Measured four-dimensional practice grid">
 <canvas aria-label="4D practice grid"></canvas><div class="eco-practice-labels" aria-hidden="true"></div>
 <dl class="eco-practice-position" aria-label="Camera position">${[...axes,'W'].map(axis=>`<div><dt>${axis}</dt><dd><output data-coordinate="${axis}">0.0</output></dd></div>`).join('')}</dl>
 <p class="eco-practice-status" role="status">Preparing practice grid…</p></section>
 <aside class="eco-network-controls eco-practice-controls"><h2>Navigation practice</h2>
 <p>Drag to look. W/S move forward/backward, A/D move left/right. E/Q applies the selected W transformation. Hold Shift for 10× speed; Control for 0.1× speed.</p>
 <label>Practice object <select id="practice-object"><option value="grid">Measured grid</option><option value="tesseract">Tesseract</option></select></label>
 <label>E/Q transformation <select id="practice-transform"><option value="translate">Translate along W</option><option value="rotate">Rotate through W</option><option value="scale">Stretch W</option></select></label>
 <label>Rotation plane <select id="practice-plane"><option value="0">X–W</option><option value="1">Y–W</option><option value="2">Z–W</option></select></label>
 <label>Rotation angle <output id="practice-angle-value">0.0°</output><input id="practice-angle" type="range" min="-180" max="180" step="0.1" value="0"></label>
 <label>W scale <output id="practice-scale-value">1.00×</output><input id="practice-scale" type="range" min="0.1" max="3" step="0.01" value="1"></label>
 <label><input id="practice-auto" type="checkbox">Slow auto-rotation</label>
 <p>Rotation turns W into the selected spatial axis. Stretching changes only W before rotation; 1× restores its original length. A tesseract has 16 vertices and 32 edges, colored by axis. Vertex labels show original coordinates.</p>
 <label>Camera movement speed <output id="camera-speed-value">1.0</output>×<input id="camera-speed" type="range" min="0.1" max="10" step="0.1" value="1"></label>
 <div data-grid-guide><h3>Grid measurements</h3><p>XYZ grid: −100 to +100, spaced every 50 units. W layers: −200 to +200, spaced every 100 units.</p>
 <ul class="eco-practice-key">${axes.map((axis,i)=>`<li style="--axis-color:${axisColors[i]}">${axis} axis</li>`).join('')}<li style="--axis-color:#d4b1ff">W depth layers</li></ul>
 <div class="eco-practice-gradient" aria-label="W depth gradient from minus 200 to plus 200"></div><div class="eco-practice-scale"><span>W −200</span><span>0</span><span>+200</span></div>
 <p>The colored layers are projections of the same grid at different W coordinates. They spread or contract as you move through W. All four camera coordinates use grid units, relative to the starting viewpoint. Layers disappear when they cross the 4D near plane.</p>
 </div><div class="eco-practice-actions"><button type="button" data-w-step="-50">− (Q)</button><button type="button" data-w-step="50">+ (E)</button><button type="button" data-reset-practice>Reset position</button><button type="button" data-practice-exit>Return to graph</button></div>
 </aside></div>`
 const $=selector=>root.querySelector(selector),canvas=$('canvas'),view=$('.eco-practice-view'),status=$('.eco-practice-status')
 persistNetworkSettings(root,abort.signal)
 $('#camera-speed').addEventListener('input',()=>{$('#camera-speed-value').textContent=Number($('#camera-speed').value).toFixed(1)},{signal:abort.signal})
 let segments=[],labelItems=[]
 const geometry=new BufferGeometry()
 const material=new LineBasicMaterial({vertexColors:true,transparent:true,opacity:.65}),grid=new LineSegments(geometry,material);grid.frustumCulled=false
 function setObject(){
  const tesseract=$('#practice-object').value==='tesseract',data=tesseract?practiceTesseract():practiceGrid();segments=data.segments
  $('[data-grid-guide]').hidden=tesseract;view.setAttribute('aria-label',tesseract?'Four-dimensional tesseract':'Measured four-dimensional practice grid')
  geometry.setAttribute('position',new Float32BufferAttribute(new Float32Array(segments.length*6),3));geometry.setAttribute('color',new Float32BufferAttribute(new Float32Array(segments.length*6),3))
  $('.eco-practice-labels').replaceChildren()
  labelItems=data.labels.map(label=>{const element=document.createElement('span');element.textContent=label.text;element.style.color=label.color;$('.eco-practice-labels').append(element);return {...label,element}})
  projectionDirty=true;requestRender()
 }
 function syncTransforms(){
  $('#practice-angle').value=angle;$('#practice-angle-value').textContent=angle.toFixed(1)+'°'
  $('#practice-scale').value=wScale;$('#practice-scale-value').textContent=wScale.toFixed(2)+'×'
  projectionDirty=true;requestRender()
 }
 function transformStep(delta){
  const mode=$('#practice-transform').value
  if(mode==='translate')position4[3]+=delta
  if(mode==='rotate')angle=((angle+delta*.3+180)%360+360)%360-180
  if(mode==='scale')wScale=Math.max(.1,Math.min(3,wScale*Math.exp(delta*.003)))
  syncTransforms()
 }
 function projectPoint(point){return project4D(transformPracticePoint(point,Number($('#practice-plane').value),angle,wScale),[0,0,0],.5,200,position4)}
 $('#practice-object').addEventListener('change',()=>{setObject();if($('#practice-object').value==='tesseract')$('#practice-transform').value='rotate';reset()},{signal:abort.signal})
 $('#practice-angle').addEventListener('input',()=>{angle=Number($('#practice-angle').value);syncTransforms()},{signal:abort.signal})
 $('#practice-scale').addEventListener('input',()=>{wScale=Number($('#practice-scale').value);syncTransforms()},{signal:abort.signal})
 $('#practice-plane').addEventListener('change',syncTransforms,{signal:abort.signal})
 $('#practice-auto').addEventListener('change',()=>{lastTime=0;requestRender()},{signal:abort.signal})
 document.addEventListener('visibilitychange',()=>{lastTime=0;requestRender()},{signal:abort.signal})
 setObject()
 const color=new Color(),layerColor=new Color()
 function requestRender(){if(!disposed&&!frame)frame=requestAnimationFrame(render)}
 function render(time){
  frame=0;if(!renderer||disposed)return
  if($('#practice-auto').checked&&!document.hidden){
   if(lastTime){angle=((angle+Math.min((time-lastTime)/1000,.05)*15+180)%360)-180;syncTransforms()}
   lastTime=time;requestRender()
  }else lastTime=0
  if(projectionDirty){
   projectionDirty=false
   segments.forEach((segment,index)=>{
    const points=[projectPoint(segment.from),projectPoint(segment.to)];layerColor.setHSL((segment.w+200)/400*.65+.05,.65,.55)
    points.forEach((point,end)=>{
     geometry.attributes.position.array.set(points.every(Boolean)?point:[0,0,0],index*6+end*3)
     color.set(axisColors[segment.axis]||'#d4b1ff').lerp(layerColor,.35).multiplyScalar((end ? .95 : .5)/(1+Math.abs(segment.w-position4[3])/400))
     color.toArray(geometry.attributes.color.array,index*6+end*3)
    })
   })
   geometry.attributes.position.needsUpdate=true;geometry.attributes.color.needsUpdate=true
  }
  const position=Object.fromEntries(axes.map((axis,i)=>[axis.toLowerCase(),position4[i]]))
  for(const axis of axes)$(`[data-coordinate="${axis}"]`).textContent=position[axis.toLowerCase()].toFixed(1)
  $('[data-coordinate="W"]').textContent=position4[3].toFixed(1)
  renderer.render()
  for(const label of labelItems){const p=projectPoint(label.point),screen=p?renderer.project({x:p[0],y:p[1],z:p[2]}):{visible:false};label.element.hidden=!screen.visible;if(screen.visible)label.element.style.transform=`translate(${screen.x}px,${screen.y}px) translate(-50%,-50%)`}
 }
 function reset(){position4=[0,0,0,0];angle=0;wScale=1;lastTime=0;$('#practice-auto').checked=false;syncTransforms();renderer?.fit([{x:-100,y:-100,z:-100,renderRadius:0},{x:100,y:100,z:100,renderRadius:0}]);requestRender()}
 root.addEventListener('click',event=>{if(event.target.closest('[data-reset-practice]')){reset();canvas.focus({preventScroll:true})}const step=event.target.closest('[data-w-step]');if(step){transformStep(Number(step.dataset.wStep))}},{signal:abort.signal})
 const resize=()=>{if(renderer){renderer.resize(view.clientWidth,view.clientHeight);requestRender()}},observer=new ResizeObserver(resize);observer.observe(view)
 void createNetworkGPU3D(canvas,message=>{status.textContent=message},requestRender,'4D',()=>Number($('#camera-speed').value),delta=>{position4=position4.map((v,i)=>v+(i<3?delta[i]:0));transformStep(delta[3])}).then(value=>{
  if(disposed){value.dispose();return}renderer=value;renderer.attach(grid);canvas.dataset.renderer='practice4d';canvas.dataset.backend=renderer.backend;canvas.setAttribute('aria-label','4D practice. Drag to look. W/S forward/backward, A/D left/right. E/Q applies the selected transformation. Hold Shift for 10× speed; Control for 0.1× speed.');reset();resize();status.textContent='Click or Tab to the grid to begin. Coordinates are in grid units, relative to the starting viewpoint.'
 }).catch(error=>{if(!disposed)status.textContent=error.message||'Practice graphics could not start.'})
 return ()=>{disposed=true;abort.abort();observer.disconnect();cancelAnimationFrame(frame);renderer?.dispose();geometry.dispose();material.dispose();root.replaceChildren()}
}
