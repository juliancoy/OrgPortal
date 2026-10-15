import {WebGPURenderer,Scene,PerspectiveCamera,AmbientLight,DirectionalLight,InstancedMesh,SphereGeometry,CylinderGeometry,ConeGeometry,MeshStandardMaterial,MeshBasicMaterial,Object3D,Vector3,Vector2,Color,Raycaster,Box3} from 'three/webgpu'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
export async function createNetworkGPU3D(canvas,onLost,changed){
 if(!navigator.gpu||!await navigator.gpu.requestAdapter())throw Error('3D WebGPU requires a supported browser and a secure connection. Use the Graph tab instead.')
 const renderer=new WebGPURenderer({canvas,antialias:true,alpha:true})
 try{await renderer.init();if(!renderer.backend.isWebGPUBackend)throw Error('A native WebGPU device is required for this tab.')}catch(error){renderer.dispose();throw error}
 let disposed=false,width=1,height=1,compiled=false,compiling=false,referenceDistance=1
 const device=renderer.backend.device
 device.lost.then(info=>{if(!disposed)onLost(info.message||'WebGPU device lost')})
 device.addEventListener('uncapturederror',event=>{if(!disposed)onLost(event.error.message)})
 const scene=new Scene(),camera=new PerspectiveCamera(45,1,.1,1e7)
 camera.position.set(200,120,400)
 scene.add(new AmbientLight(0xffffff,2));const light=new DirectionalLight(0xffffff,3);light.position.set(300,600,500);scene.add(light)
 const controls=new OrbitControls(camera,canvas);controls.enableDamping=false;controls.addEventListener('change',changed)
 const geometries=[new SphereGeometry(1,24,16),new CylinderGeometry(1,1,1,5),new ConeGeometry(1,1,6)]
 const materials=[new MeshStandardMaterial({color:0xffffff,roughness:.65,metalness:.05}),new MeshBasicMaterial({color:0xffffff}),new MeshBasicMaterial({color:0xffffff})]
 const meshes=[null,null,null],object=new Object3D(),up=new Vector3(0,1,0),a=new Vector3(),b=new Vector3(),direction=new Vector3(),color=new Color(),ray=new Raycaster()
 let renderedNodes=[],renderedEdges=[]
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
 return {
  update(nodes,edges,visible,visibleEdges,selected,colors,edgeColor){
   renderedNodes=nodes.filter(n=>visible.has(n.id));renderedEdges=edges.filter(e=>visibleEdges.has(e.id))
   const spheres=mesh(0,renderedNodes.length),bodies=mesh(1,renderedEdges.length),arrows=mesh(2,renderedEdges.length)
   renderedNodes.forEach((n,i)=>{a.set(n.x,n.y,n.z||0);scale.setScalar(n.renderRadius);place(spheres,i,a,scale,identity,n.id===selected?0xe56d3c:colors[n.category]??0x77878c)})
   renderedEdges.forEach((e,i)=>{
    a.set(e.source.x,e.source.y,e.source.z||0);b.set(e.target.x,e.target.y,e.target.z||0);direction.subVectors(b,a)
    const distance=direction.length();direction.normalize();const gap=Math.max(.01,distance-e.source.renderRadius-e.target.renderRadius-8)
    a.addScaledVector(direction,e.source.renderRadius+2);object.quaternion.setFromUnitVectors(up,direction)
    const rotation=object.quaternion.clone(),tint=edgeColor(e),thickness=Math.max(.4,(e.quantityWidth||1.4)/2)
    b.copy(a).addScaledVector(direction,gap/2);scale.set(thickness,gap,thickness);place(bodies,i,b,scale,rotation,tint)
    b.copy(a).addScaledVector(direction,gap+3);scale.set(thickness*2.5,6,thickness*2.5);place(arrows,i,b,scale,rotation,tint)
   })
   for(const m of meshes){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.computeBoundingSphere()}
  },
  render(){
   if(disposed)return
   if(!compiled){if(!compiling){compiling=true;renderer.compileAsync(scene,camera).then(()=>{compiling=false;compiled=true;if(!disposed)changed()}).catch(error=>{compiling=false;if(!disposed)onLost(error.message)})}return}
   renderer.render(scene,camera)
  },
  resize(w,h){width=Math.max(1,w);height=Math.max(1,h);renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix()},
  project(n){const p=new Vector3(n.x,n.y,n.z||0).project(camera);return {x:(p.x+1)*width/2,y:(1-p.y)*height/2,visible:p.z>=0&&p.z<=1&&Math.abs(p.x)<=1&&Math.abs(p.y)<=1,depth:p.z}},
  fit(nodes){
   const box=new Box3();for(const n of nodes)box.expandByPoint(new Vector3(n.x,n.y,n.z||0))
   const center=nodes.length?box.getCenter(new Vector3()):new Vector3(),extent=nodes.length?box.getSize(new Vector3()).length()/2:50
   const radius=Math.max(60,extent+Math.max(0,...nodes.map(n=>n.renderRadius)))
   const distance=radius/Math.sin(camera.fov*Math.PI/360)/Math.min(1,camera.aspect)*1.15
   controls.target.copy(center);camera.position.copy(center).add(new Vector3(.45,.3,1).normalize().multiplyScalar(distance));camera.near=Math.max(.1,distance/1e4);camera.far=distance*100;camera.updateProjectionMatrix();controls.minDistance=radius*.15;controls.maxDistance=distance*20;controls.update();referenceDistance=distance
  },
  zoom(factor){const delta=camera.position.clone().sub(controls.target),distance=Math.max(controls.minDistance,Math.min(controls.maxDistance,delta.length()/factor));camera.position.copy(controls.target).add(delta.setLength(distance));controls.update();changed()},
  zoomLevel(){return referenceDistance/Math.max(.01,camera.position.distanceTo(controls.target))},
  hit(event){
   if(!meshes[0])return {}
   const rect=canvas.getBoundingClientRect();ray.setFromCamera(new Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera)
   const first=ray.intersectObjects(meshes.filter(Boolean),false)[0];if(!first)return {}
   return first.object===meshes[0]?{node:renderedNodes[first.instanceId]}:{edge:renderedEdges[first.instanceId]}
  },
  dispose(){disposed=true;controls.dispose();for(const m of meshes)if(m)m.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose()},
 }
}
