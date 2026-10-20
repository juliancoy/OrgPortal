import {frameTargetMs} from './frame-budget.js'
import {WebGPURenderer,Scene,PerspectiveCamera,OrthographicCamera,AmbientLight,DirectionalLight,InstancedMesh,SphereGeometry,CylinderGeometry,ConeGeometry,MeshStandardNodeMaterial,MeshBasicNodeMaterial,MeshBasicMaterial,DataTexture,InstancedBufferAttribute,SRGBColorSpace,NearestFilter,BackSide,Object3D,Vector3,Vector2,Euler,Quaternion,Color,Raycaster,Box3,WebGLCoordinateSystem} from 'three/webgpu'
import {attribute,texture,uv,vec2} from 'three/tsl'
import {spherePieAtlas} from './sphere-pies.js'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
export async function createNetworkGPU3D(canvas,onLost,changed,dimension='3D',movementSpeed=()=>1,moveFourth=()=>{}){
 // Three.js falls back to WebGL 2 when WebGPU has no usable adapter.
 const renderer=new WebGPURenderer({canvas,antialias:true,alpha:true})
 try{await renderer.init()}catch(error){renderer.dispose();throw new Error(dimension+' graphics could not start. Use the Graph tab instead.',{cause:error})}
 let quality=0,slowFrames=0,fastFrames=0
 let pendingUpdate=null,compilePromise=null
 let disposed=false,width=1,height=1,compiled=false,compiling=false,referenceDistance=1
 const device=renderer.backend.device
 device?.lost.then(info=>{if(!disposed)onLost(info.message||'WebGPU device lost')})
 device?.addEventListener('uncapturederror',event=>{if(!disposed)onLost(event.error.message)})
 const scene=new Scene();let camera=new PerspectiveCamera(45,1,.1,1e7),transitionFrame=0
 camera.position.set(200,120,400)
 scene.add(new AmbientLight(0xffffff,2));const light=new DirectionalLight(0xffffff,3);light.position.set(300,600,500);scene.add(light)
 const controls=new OrbitControls(camera,canvas);controls.enableDamping=false;controls.addEventListener('change',changed)
 controls.enableRotate=false
 const input=new AbortController(),keys=new Set(),rotation=new Euler(0,0,0,'YXZ'),forward=new Vector3(),right=new Vector3(),vertical=new Vector3(),movement=new Vector3()
 let look=null,moveFrame=0,lastMove=0,boosted=false,slowed=false
 const previousTabIndex=canvas.getAttribute('tabindex'),previousLabel=canvas.getAttribute('aria-label')
 canvas.tabIndex=0;canvas.setAttribute('aria-label',dimension+' network. Drag to look around. W/S move forward/backward; A/D move left/right. '+(dimension!=='3D'?'E/Q move through the selected hidden dimension.':'E moves up; Q moves down.')+' Hold Shift for 10× speed; Control for 0.1× speed.')
 const stopMovement=()=>{boosted=false;slowed=false;keys.clear();cancelAnimationFrame(moveFrame);moveFrame=0;lastMove=0;look=null}
 function move(time){
  moveFrame=0
  if(disposed||!keys.size)return
  const dt=lastMove?Math.min((time-lastMove)/1000,.05):0;lastMove=time
  camera.getWorldDirection(forward);right.setFromMatrixColumn(camera.matrixWorld,0)
  movement.set(0,0,0).addScaledVector(forward,Number(keys.has('KeyW'))-Number(keys.has('KeyS'))).addScaledVector(right,Number(keys.has('KeyD'))-Number(keys.has('KeyA')))
  const fourth=dimension!=='3D',axis=Number(keys.has('KeyE'))-Number(keys.has('KeyQ'))
  if(!fourth){vertical.setFromMatrixColumn(camera.matrixWorld,1);movement.addScaledVector(vertical,axis)}
  const length=Math.max(1,Math.sqrt(movement.lengthSq()+(fourth?axis*axis:0))),step=.5*movementSpeed()*(boosted?10:1)*(slowed?0.1:1)*dt/length
  movement.multiplyScalar(referenceDistance*step)
  if(fourth){if(movement.lengthSq()||axis)moveFourth([movement.x,movement.y,movement.z,axis*referenceDistance*step])}
  else if(movement.lengthSq()){camera.position.add(movement);controls.target.add(movement);controls.update();changed()}
  moveFrame=requestAnimationFrame(move)
 }
 canvas.addEventListener('keydown',event=>{
  boosted=event.shiftKey;slowed=event.ctrlKey
  if(!['KeyW','KeyA','KeyS','KeyD','KeyE','KeyQ'].includes(event.code)||event.metaKey||event.altKey)return
  event.preventDefault();keys.add(event.code);if(!moveFrame)moveFrame=requestAnimationFrame(move)
 },{signal:input.signal})
 window.addEventListener('keyup',event=>{boosted=event.shiftKey;slowed=event.ctrlKey;keys.delete(event.code);if(!keys.size){cancelAnimationFrame(moveFrame);moveFrame=0;lastMove=0}},{signal:input.signal})
 canvas.addEventListener('blur',stopMovement,{signal:input.signal});window.addEventListener('blur',stopMovement,{signal:input.signal})
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMovement()},{signal:input.signal})
 canvas.addEventListener('pointerdown',event=>{canvas.focus({preventScroll:true});if(event.button===0&&event.isPrimary){look={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId)}},{signal:input.signal})
 canvas.addEventListener('pointermove',event=>{
  if(!look||event.pointerId!==look.id)return
  rotation.setFromQuaternion(camera.quaternion);rotation.y-=(event.clientX-look.x)*.004;rotation.x=Math.max(-Math.PI/2+.01,Math.min(Math.PI/2-.01,rotation.x-(event.clientY-look.y)*.004))
  look.x=event.clientX;look.y=event.clientY
  const distance=camera.position.distanceTo(controls.target)
  camera.quaternion.setFromEuler(rotation);camera.getWorldDirection(forward);controls.target.copy(camera.position).addScaledVector(forward,distance);controls.update();changed()
 },{signal:input.signal})
 for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,event=>{if(event.pointerId===look?.id)look=null},{signal:input.signal})

 const geometries=[new SphereGeometry(1,32,20),new CylinderGeometry(1,1,1,5),new ConeGeometry(1,1,6),new SphereGeometry(1,32,20)]
 const pieTexture=new DataTexture(new Uint8Array([255,255,255,255]),1,1)
 pieTexture.colorSpace=SRGBColorSpace;pieTexture.minFilter=pieTexture.magFilter=NearestFilter;pieTexture.generateMipmaps=false;pieTexture.needsUpdate=true
 const sphereMaterial=new MeshStandardNodeMaterial({color:0xffffff,roughness:.65,metalness:.05})
 const atlas=attribute('pieAtlas','vec3')
 sphereMaterial.colorNode=texture(pieTexture,vec2(uv().x.mul(atlas.z).add(atlas.x),atlas.y)).rgb
 const materials=[sphereMaterial,new MeshBasicNodeMaterial({color:0xffffff,transparent:true,depthWrite:false}),new MeshBasicNodeMaterial({color:0xffffff,transparent:true,depthWrite:false}),new MeshBasicMaterial({color:0xffffff,side:BackSide})]
 materials[1].opacityNode=attribute('edgeOpacity','float');materials[2].opacityNode=attribute('edgeOpacity','float')
 const meshes=[null,null,null,null],object=new Object3D(),up=new Vector3(0,1,0),a=new Vector3(),b=new Vector3(),direction=new Vector3(),color=new Color(),ray=new Raycaster()
 let renderedNodes=[],renderedEdges=[],outlinedNodes=[],atlasNodes=[],pieFacingDirty=true
 const pieFacing=new Quaternion(),lastCameraOrientation=new Quaternion(),piePole=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-Math.PI/2).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/2))
 function mesh(index,count){
  let m=meshes[index]
  if(!m||m.instanceMatrix.count<Math.max(1,count)){
   if(m){scene.remove(m);m.dispose()}
   m=new InstancedMesh(geometries[index],materials[index],Math.max(1,count));m.frustumCulled=false;scene.add(m);meshes[index]=m;compiled=false
  }
  m.count=count;return m
 }
 function place(m,index,position,scale,rotation,tint){object.position.copy(position);object.scale.copy(scale);object.quaternion.copy(rotation);object.updateMatrix();m.setMatrixAt(index,object.matrix);m.setColorAt(index,color.set(tint))}
 const scale=new Vector3(),identity=object.quaternion.clone()
 const api={
  backend:renderer.backend.isWebGPUBackend?'webgpu':'webgl2',
  attach(object){scene.add(object);compiled=false;changed()},
  setCameraMode(mode){
   const distance=camera.position.distanceTo(controls.target),half=distance*Math.tan(Math.PI/8),next=mode==='orthographic'?new OrthographicCamera(-half*width/height,half*width/height,half,-half,camera.near,camera.far):new PerspectiveCamera(45,width/height,camera.near,camera.far)
   next.position.copy(camera.position);next.quaternion.copy(camera.quaternion);camera=next;controls.object=camera;compiled=false;camera.updateProjectionMatrix();controls.update();changed()
  },
  focus(node,immediate=false){
   cancelAnimationFrame(transitionFrame);const start=camera.position.clone(),targetStart=controls.target.clone(),endTarget=new Vector3(node.x,node.y,node.z||0),offset=start.clone().sub(targetStart),end=endTarget.clone().add(offset),started=performance.now()
   const tick=now=>{const t=immediate?1:Math.min(1,(now-started)/350),ease=t*t*(3-2*t);camera.position.lerpVectors(start,end,ease);controls.target.lerpVectors(targetStart,endTarget,ease);controls.update();changed();if(t<1&&!disposed)transitionFrame=requestAnimationFrame(tick)};tick(started)
  },
  cameraPosition(){camera.updateMatrixWorld();return {x:camera.position.x,y:camera.position.y,z:camera.position.z}},
  update(nodes,edges,visible,visibleEdges,selected,colors,edgeColor,updated=null){
   if(compiling){pendingUpdate=[nodes,edges,visible,visibleEdges,selected,colors,edgeColor,null];return}
   pieFacingDirty=true
   const previousNodes=renderedNodes,previousEdges=renderedEdges
   renderedNodes=nodes.filter(n=>visible.has(n.id)&&!n.clipped4D);renderedEdges=edges.filter(e=>visibleEdges.has(e.id)&&!e.source.clipped4D&&!e.target.clipped4D)
   if(updated&&(previousNodes.length!==renderedNodes.length||previousEdges.length!==renderedEdges.length||renderedNodes.some((n,i)=>n.id!==previousNodes[i]?.id)||renderedEdges.some((e,i)=>e.id!==previousEdges[i]?.id)))updated=null
   for(const index of [1,2])geometries[index].setAttribute('edgeOpacity',new InstancedBufferAttribute(Float32Array.from(renderedEdges,e=>e.opacity??.2),1))
   const spheres=mesh(0,renderedNodes.length),bodies=mesh(1,renderedEdges.length),arrows=mesh(2,renderedEdges.length)
   if(atlasNodes.length!==renderedNodes.length||renderedNodes.some((n,i)=>atlasNodes[i].id!==n.id||atlasNodes[i].pie!==n.financialPie)){
    const atlas=spherePieAtlas(renderedNodes,device?.limits.maxTextureDimension2D||4096)
    if(pieTexture.image.width!==atlas.width||pieTexture.image.height!==atlas.height)pieTexture.dispose()
    pieTexture.image={data:atlas.data,width:atlas.width,height:atlas.height};pieTexture.needsUpdate=true
    geometries[0].setAttribute('pieAtlas',new InstancedBufferAttribute(atlas.coordinates,3));compiled=false
    atlasNodes=renderedNodes.map(n=>({id:n.id,pie:n.financialPie}))
   }else if(!geometries[0].getAttribute('pieAtlas')){
    geometries[0].setAttribute('pieAtlas',new InstancedBufferAttribute(new Float32Array([.5,.5,0]),3))
   }
   outlinedNodes=renderedNodes.filter(n=>n.financialPie?.slices.length)
   const outlines=mesh(3,outlinedNodes.length)
   outlinedNodes.forEach((n,i)=>{if(updated&&!updated.has(n.id))return;a.set(n.x,n.y,n.z||0);scale.setScalar(n.renderRadius+(n.id===selected?2:1));place(outlines,i,a,scale,identity,n.id===selected?0xe56d3c:n.opacity<1?0x606c76:colors[n.category]??0x77878c)})
   renderedNodes.forEach((n,i)=>{if(updated&&!updated.has(n.id))return;a.set(n.x,n.y,n.z||0);scale.setScalar(n.renderRadius);place(spheres,i,a,scale,identity,n.financialPie?.slices.length?0xffffff:n.id===selected?0xe56d3c:n.opacity<1?0x606c76:colors[n.category]??0x77878c)})
   renderedEdges.forEach((e,i)=>{
    if(updated&&!updated.has(e.source.id)&&!updated.has(e.target.id))return
    a.set(e.source.x,e.source.y,e.source.z||0);b.set(e.target.x,e.target.y,e.target.z||0);direction.subVectors(b,a)
    const distance=direction.length();direction.normalize();const gap=Math.max(.01,distance-e.source.renderRadius-e.target.renderRadius-8)
    a.addScaledVector(direction,e.source.renderRadius+2);object.quaternion.setFromUnitVectors(up,direction)
    const rotation=object.quaternion.clone(),tint=edgeColor(e),thickness=(e.quantityWidth||1.4)/2
    b.copy(a).addScaledVector(direction,gap/2);scale.set(thickness,gap,thickness);place(bodies,i,b,scale,rotation,tint)
    b.copy(a).addScaledVector(direction,gap+3);scale.set(e.directional?thickness*2.5:0,e.directional?6:0,e.directional?thickness*2.5:0);place(arrows,i,b,scale,rotation,tint)
   })
   for(const m of meshes){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.boundingSphere=null}
  },
  render(){
   if(disposed)return false
   // Keep the pie pole facing the camera so every slice remains visible.
   if(meshes[0]&&(pieFacingDirty||!lastCameraOrientation.equals(camera.quaternion))){
    pieFacing.copy(camera.quaternion).multiply(piePole);lastCameraOrientation.copy(camera.quaternion);pieFacingDirty=false
    renderedNodes.forEach((n,i)=>{if(!n.financialPie?.slices.length)return;object.position.set(n.x,n.y,n.z||0);object.scale.setScalar(n.renderRadius);object.quaternion.copy(pieFacing);object.updateMatrix();meshes[0].setMatrixAt(i,object.matrix)})
    meshes[0].instanceMatrix.needsUpdate=true
   }
   if(!compiled){if(!compiling){compiling=true;compilePromise=renderer.compileAsync(scene,camera).then(()=>{compiling=false;compiled=true;if(!disposed){if(pendingUpdate){const args=pendingUpdate;pendingUpdate=null;api.update(...args)}changed()}}).catch(error=>{compiling=false;if(!disposed)onLost(error.message)})}return false}
   renderer.render(scene,camera)
   return true
  },
  adapt(milliseconds,minimumFPS=10){
   const limit=frameTargetMs(minimumFPS)
   slowFrames=milliseconds>limit*.75?slowFrames+1:0;fastFrames=milliseconds<limit*.4?fastFrames+1:0
   const next=slowFrames>=4?Math.min(3,quality+1):fastFrames>=300?Math.max(0,quality-1):quality
   if(next===quality)return
   quality=next;slowFrames=0;fastFrames=0
   const [segments,rings]=[[32,20],[16,10],[8,6],[6,4]][quality]
   for(const index of [0,3]){const old=geometries[index],geometry=new SphereGeometry(1,segments,rings);if(index===0&&old.getAttribute('pieAtlas'))geometry.setAttribute('pieAtlas',old.getAttribute('pieAtlas'));geometries[index]=geometry;if(meshes[index])meshes[index].geometry=geometry;old.dispose()}
   renderer.setPixelRatio(Math.min(devicePixelRatio,2)*[1,.8,.65,.4][quality]);renderer.setSize(width,height,false);compiled=false
  },
  resize(w,h){width=Math.max(1,w);height=Math.max(1,h);renderer.setPixelRatio(Math.min(devicePixelRatio,2)*[1,.8,.65,.4][quality]);renderer.setSize(width,height,false);if(camera.isOrthographicCamera){const half=(camera.top-camera.bottom)/2;camera.left=-half*width/height;camera.right=half*width/height}else camera.aspect=width/height;camera.updateProjectionMatrix()},
  project(n){if(n.clipped4D)return {x:0,y:0,visible:false,depth:Infinity};const p=new Vector3(n.x,n.y,n.z||0).project(camera);return {x:(p.x+1)*width/2,y:(1-p.y)*height/2,visible:p.z>=(camera.coordinateSystem===WebGLCoordinateSystem?-1:0)&&p.z<=1&&Math.abs(p.x)<=1&&Math.abs(p.y)<=1,depth:p.z}},
  fit(nodes){
   nodes=nodes.filter(n=>!n.clipped4D)
   const box=new Box3();for(const n of nodes)box.expandByPoint(new Vector3(n.x,n.y,n.z||0))
   const center=nodes.length?box.getCenter(new Vector3()):new Vector3(),extent=nodes.length?box.getSize(new Vector3()).length()/2:50
   const radius=Math.max(60,extent+Math.max(0,...nodes.map(n=>n.renderRadius)))
   const distance=radius/Math.sin(Math.PI/8)/Math.min(1,width/height)*1.15
   if(camera.isOrthographicCamera){camera.zoom=1;camera.top=radius*1.15;camera.bottom=-radius*1.15;camera.left=-radius*1.15*width/height;camera.right=radius*1.15*width/height}
   controls.target.copy(center);camera.position.copy(center).add(new Vector3(.45,.3,1).normalize().multiplyScalar(distance));camera.near=Math.max(.1,distance/1e4);camera.far=distance*100;camera.updateProjectionMatrix();controls.minDistance=radius*.15;controls.maxDistance=distance*20;controls.update();referenceDistance=distance
  },
  zoom(factor){if(camera.isOrthographicCamera){camera.zoom=Math.max(.05,Math.min(100,camera.zoom*factor));camera.updateProjectionMatrix();changed();return}const delta=camera.position.clone().sub(controls.target),distance=Math.max(controls.minDistance,Math.min(controls.maxDistance,delta.length()/factor));camera.position.copy(controls.target).add(delta.setLength(distance));controls.update();changed()},
  zoomLevel(){return (camera.isOrthographicCamera?camera.zoom:1)*referenceDistance/Math.max(.01,camera.position.distanceTo(controls.target))},
  hit(event){
   if(!meshes[0])return {}
   const rect=canvas.getBoundingClientRect();ray.setFromCamera(new Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera)
   const first=ray.intersectObjects(meshes.filter(Boolean),false)[0];if(!first)return {}
   return first.object===meshes[0]?{node:renderedNodes[first.instanceId]}:first.object===meshes[3]?{node:outlinedNodes[first.instanceId]}:{edge:renderedEdges[first.instanceId]}
  },
  dispose(){cancelAnimationFrame(transitionFrame);disposed=true;stopMovement();input.abort();if(previousTabIndex===null)canvas.removeAttribute('tabindex');else canvas.setAttribute('tabindex',previousTabIndex);if(previousLabel===null)canvas.removeAttribute('aria-label');else canvas.setAttribute('aria-label',previousLabel);controls.dispose();const release=()=>{for(const m of meshes)if(m)m.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());pieTexture.dispose();renderer.dispose()};if(compilePromise&&compiling)void compilePromise.finally(release);else release()},
 };return api
}
