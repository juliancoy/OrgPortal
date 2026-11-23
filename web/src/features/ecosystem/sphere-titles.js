import {CanvasTexture,Mesh,MeshBasicNodeMaterial,SphereGeometry,SRGBColorSpace,Vector3} from 'three/webgpu'
import {paintSphereTitle,sphereTitleReadable} from './sphere-title-text.js'

// Curved, transparent decals sit just above the actual sphere surface. Camera
// facing keeps them readable while depth testing lets nearer spheres occlude them.
export function createSphereTitles(scene){
 const geometry=new SphereGeometry(1,24,12,Math.PI/2-.95,1.9,Math.PI/2-.55,1.1),labels=new Map(),point=new Vector3()
 const remove=id=>{const label=labels.get(id);scene.remove(label.mesh);label.texture.dispose();label.mesh.material.dispose();labels.delete(id)}
 return {
  update(nodes,camera,height,pixelRatio=1){
   camera.updateMatrixWorld()
   const candidates=[]
   for(const node of nodes){
    if(!node.sphereTitle)continue
    point.set(node.x,node.y,node.z||0).applyMatrix4(camera.matrixWorldInverse)
    if(point.z>=-camera.near)continue
    const pixels=node.renderRadius*height*(camera.isOrthographicCamera?camera.zoom/(camera.top-camera.bottom):1/(-2*point.z*Math.tan(camera.fov*Math.PI/360)))
    point.set(node.x,node.y,node.z||0).project(camera)
    if(!sphereTitleReadable(node.sphereTitle,pixels,true,pixelRatio)||Math.abs(point.x)>1.1||Math.abs(point.y)>1.1||point.z>1)continue
    candidates.push({node,pixels})
   }
   // Bound texture memory and draw calls in very large neighborhoods. Zooming
   // makes local names eligible; search always exposes every organization's name.
   const visible=candidates.sort((a,b)=>b.pixels-a.pixels||a.node.id.localeCompare(b.node.id)).slice(0,128),ids=new Set(visible.map(({node})=>node.id))
   let changed=false
   for(const id of labels.keys())if(!ids.has(id)){remove(id);changed=true}
   for(const {node} of visible){
    let label=labels.get(node.id)
    if(label&&label.title!==node.sphereTitle){remove(node.id);label=null}
    if(!label){
     const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256
     paintSphereTitle(canvas.getContext('2d'),node.sphereTitle,256,128,480,224)
     const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace
     const material=new MeshBasicNodeMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1})
     const mesh=new Mesh(geometry,material);mesh.renderOrder=2;scene.add(mesh)
     label={mesh,texture,title:node.sphereTitle};labels.set(node.id,label);changed=true
    }
    label.mesh.position.set(node.x,node.y,node.z||0);label.mesh.scale.setScalar(node.renderRadius*1.008)
    label.mesh.up.set(0,1,0).applyQuaternion(camera.quaternion)
    label.mesh.lookAt(camera.position);label.mesh.material.opacity=node.opacity??1
   }
   return {changed,count:labels.size}
  },
  has(id){return labels.has(id)},
  dispose(){for(const id of labels.keys())remove(id);geometry.dispose()},
 }
}
