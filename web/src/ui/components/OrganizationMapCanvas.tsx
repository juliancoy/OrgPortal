import {useEffect,useId,useMemo,useRef,useState} from 'react'
import {abbreviateBoardLabel} from '../../domain/organization/groupNames'
import {organizationMapLayout,type MapNode,type MapPage} from '../../features/ecosystem/organizationMap'
import {createNetworkCanvas,type CanvasView,type CanvasEdge} from '../../features/ecosystem/canvas-renderer.js'
import {bindPlanarNavigation} from '../../features/ecosystem/planar-navigation.js'
import type {Network3DRenderer} from '../../features/ecosystem/webgpu-3d-renderer.js'

import type {OrganizationMapView} from '../../features/ecosystem/organizationMapNavigation'

const incomingColor=0x9b59d0,outgoingColor=0xd55e00
const colors:Record<string,number>={ecosystem:0x16847d,company:0x357db7,health:0xc76e57,university:0x8564b3,funding:0xad7b26,general:0x77878c,'state-government':0xa54161,'federal-government':0x234c8c}
type Controls={zoom:(factor:number)=>void;fit:()=>void;focus:(id:string)=>void;stopFocus:()=>void}
export type OrganizationMapMode='2d'|'3d'
export function OrganizationMapCanvas({data,mode,onModeChange,onSelect,initialView}:{initialView:OrganizationMapView;data:MapPage;mode:OrganizationMapMode;onModeChange:(mode:OrganizationMapMode)=>void;onSelect:(node:MapNode,view:OrganizationMapView)=>void}){
 const latestData=useRef(data),replaceData=useRef<((next:MapPage)=>void)|null>(null)
 latestData.current=data
 const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),modeSelect=useRef<HTMLSelectElement>(null),controls=useRef<Controls|null>(null),select=useRef(onSelect)
 select.current=onSelect
 const [navigation,setNavigation]=useState(initialView.navigation),navigationRef=useRef(navigation),[speed,setSpeed]=useState(initialView.speed),speedRef=useRef(speed)
 navigationRef.current=navigation;speedRef.current=speed
 const [labels,setLabels]=useState<{id:string;name:string;x:number;y:number;focus:boolean}[]>([]),[search,setSearch]=useState(''),[status,setStatus]=useState(''),[error,setError]=useState(''),[ready,setReady]=useState(false)
 const helpId=useId(),[keyboardActive,setKeyboardActive]=useState(false)
 const matches=useMemo(()=>search.trim()?data.organizations.filter(n=>n.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())):[],[search,data])
 useEffect(()=>{
  if(!host.current||!canvas.current)return
  const element=host.current,surface=canvas.current,abort=new AbortController(),spatial=mode==='3d'
  let planar:ReturnType<typeof createNetworkCanvas>|undefined,gpu:Network3DRenderer|undefined,observer:ResizeObserver|undefined
  let data=latestData.current
  let nodes=organizationMapLayout(data,mode),byId=new Map(nodes.map(n=>[n.id,n]))
  let visible=new Set(byId.keys()),visibleEdges=new Set(data.relationships.map(e=>e.id))
  let edgeKeys=new Set(data.relationships.map(e=>JSON.stringify([e.source,e.target])))
  let edges:CanvasEdge[]=data.relationships.map(e=>({id:e.id,source:byId.get(e.source)!,target:byId.get(e.target)!,relationship:e.kinds.every(k=>k==='agency'||k==='affiliation')?'affiliation':'funding',directional:true,quantityWidth:1.4,opacity:.65,curveOffset:edgeKeys.has(JSON.stringify([e.target,e.source]))?25:0}))
  let width=1,height=1,view:CanvasView={x:-300,y:-200,w:600,h:400},selected=data.anchor!,frame=0,initialized=false,dirty=true
  let transition:{started:number;from:{x:number;y:number;z:number;opacity:number}[];to:typeof nodes;viewX:number;viewY:number}|null=null
  setLabels([]);setError('');setReady(false);setKeyboardActive(false);setStatus(spatial?'Starting 3D map…':'')
  const failed=(message:string)=>{if(abort.signal.aborted)return;initialized=false;setError(message);setStatus('');setReady(false);setLabels([]);delete surface.dataset.ready;surface.blur();controls.current=null;gpu?.dispose();gpu=undefined}
  const draw=()=>{
   frame=0;if(abort.signal.aborted||!initialized)return
   if(transition){
    const t=Math.min(1,(performance.now()-transition.started)/420),ease=t*t*(3-2*t)
    nodes.forEach((node,i)=>{const from=transition!.from[i],to=transition!.to[i];node.x=from.x+(to.x-from.x)*ease;node.y=from.y+(to.y-from.y)*ease;node.z=from.z+(to.z-from.z)*ease;node.opacity=from.opacity+(1-from.opacity)*ease})
    if(!gpu){view.x=transition.viewX+(-view.w/2-transition.viewX)*ease;view.y=transition.viewY+(-view.h/2-transition.viewY)*ease}
    dirty=true
    if(t<1)schedule();else{transition=null;delete surface.dataset.transitioning}
   }
   const scale=width/view.w
   if(!spatial)for(const node of nodes)node.renderRadius=Math.max(node.id===data.anchor?15:7,(node.id===data.anchor?10:3)/scale)
   if(dirty||!spatial)(gpu||planar)?.update(nodes,edges,visible,visibleEdges,selected,colors,e=>e.source.id===data.anchor?outgoingColor:incomingColor)
   dirty=false
   if(gpu){if(!gpu.render())return}else planar?.render(view)
   surface.dataset.ready='true';setReady(true);setStatus('')
   const placed:{id:string;name:string;x:number;y:number;focus:boolean}[]=[]
   const ranked=[...nodes].sort((a,b)=>Number(b.id===selected)-Number(a.id===selected)||Number(b.id===data.anchor)-Number(a.id===data.anchor))
   for(const node of ranked){
    const projected=gpu?.project(node)
    if(projected&&!projected.visible)continue
    const x=projected?projected.x:(node.x-view.x)*scale,y=projected?projected.y+12:(node.y-view.y)*height/view.h+node.renderRadius*scale+6,focus=node.id===data.anchor||node.id===selected
    if(x<30||x>width-30||y<0||y>height-25)continue
    if(!focus&&placed.some(label=>Math.abs(x-label.x)<125&&Math.abs(y-label.y)<30))continue
    placed.push({id:node.id,name:node.name,x,y,focus});if(placed.length>=45)break
   }
   setLabels(placed)
  }
  const schedule=()=>{if(!abort.signal.aborted&&!frame)frame=requestAnimationFrame(draw)}
  const finishTransition=()=>{
   if(!transition)return
   nodes.forEach((node,i)=>Object.assign(node,transition!.to[i]));transition=null;dirty=true;delete surface.dataset.transitioning
  }
  replaceData.current=next=>{
   if(next===data)return
   const targets=organizationMapLayout(next,mode),old=byId,origin=old.get(next.anchor!)||{x:0,y:0,z:0}
   data=next;selected=next.anchor!;drag=null
   nodes=targets.map(node=>({...node,...(old.has(node.id)?{x:old.get(node.id)!.x,y:old.get(node.id)!.y,z:old.get(node.id)!.z}:{x:origin.x,y:origin.y,z:origin.z}),opacity:old.has(node.id)?1:0}))
   byId=new Map(nodes.map(node=>[node.id,node]));visible=new Set(byId.keys());visibleEdges=new Set(next.relationships.map(e=>e.id))
   edgeKeys=new Set(next.relationships.map(e=>JSON.stringify([e.source,e.target])))
   edges=next.relationships.map(e=>({id:e.id,source:byId.get(e.source)!,target:byId.get(e.target)!,relationship:e.kinds.every(k=>k==='agency'||k==='affiliation')?'affiliation':'funding',directional:true,quantityWidth:1.4,opacity:.65,curveOffset:edgeKeys.has(JSON.stringify([e.target,e.source]))?25:0}))
   transition={started:performance.now(),from:nodes.map(n=>({x:n.x,y:n.y,z:n.z,opacity:n.opacity})),to:targets,viewX:view.x,viewY:view.y}
   surface.dataset.transitioning='true';surface.dataset.anchor=next.anchor||'';dirty=true;setSearch('')
   const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
   if(gpu)gpu.focus(targets.find(node=>node.id===next.anchor)!,reduced)
   if(reduced){finishTransition();view.x=-view.w/2;view.y=-view.h/2}
   schedule()
  }
  const fit=()=>{
   finishTransition()
   selected=data.anchor!;dirty=true
   if(gpu){gpu.fit(nodes);gpu.focus(byId.get(data.anchor!)!,true)}
   else{const extentX=Math.max(150,...nodes.map(n=>Math.abs(n.x)))+50,extentY=Math.max(150,...nodes.map(n=>Math.abs(n.y)))+50,scale=Math.min(width/(extentX*2),height/(extentY*2));view={x:-width/scale/2,y:-height/scale/2,w:width/scale,h:height/scale}}
   schedule()
  }
  const zoom=(factor:number)=>{finishTransition();if(gpu)gpu.zoom(1/factor);else{const next=Math.max(50,Math.min(2e6,view.w*factor)),ratio=next/view.w;view={x:view.x+view.w*(1-ratio)/2,y:view.y+view.h*(1-ratio)/2,w:next,h:view.h*ratio}}schedule()}
  const focus=(id:string)=>{
   const node=byId.get(id);if(!node)return
   if(id===data.anchor){surface.focus({preventScroll:true});return}
   surface.focus({preventScroll:true})
   select.current(node,{viewportTop:element.getBoundingClientRect().top,mode,navigation:navigationRef.current,speed:speedRef.current,...(gpu?{camera:gpu.cameraView()}:{planarWidth:view.w})})
  }
  let drag:{id:number;x:number;y:number;view:CanvasView}|null=null
  const down=(event:PointerEvent)=>{if(event.button!==0||!event.isPrimary)return;finishTransition();surface.focus({preventScroll:true});drag={id:event.pointerId,x:event.clientX,y:event.clientY,view:{...view}};if(!spatial)surface.setPointerCapture(event.pointerId)}
  const move=(event:PointerEvent)=>{if(!drag||spatial||event.pointerId!==drag.id)return;view={...drag.view,x:drag.view.x-(event.clientX-drag.x)*drag.view.w/width,y:drag.view.y-(event.clientY-drag.y)*drag.view.h/height};schedule()}
  const cancel=()=>{drag=null}
  const up=(event:PointerEvent)=>{
   if(!drag||event.pointerId!==drag.id)return
   const click=Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<6;drag=null
   if(!spatial&&surface.hasPointerCapture(event.pointerId))surface.releasePointerCapture(event.pointerId)
   if(!click)return
   if(gpu){const node=gpu.hit(event).node;if(node)focus(node.id);return}
   const rect=surface.getBoundingClientRect(),x=view.x+(event.clientX-rect.left)*view.w/width,y=view.y+(event.clientY-rect.top)*view.h/height
   const nearest=nodes.reduce<{node:typeof nodes[number]|null;distance:number}>((best,node)=>{const distance=Math.hypot(node.x-x,node.y-y);return distance<best.distance?{node,distance}:best},{node:null,distance:Infinity})
   if(nearest.node&&nearest.distance<Math.max(nearest.node.renderRadius,12*view.w/width))focus(nearest.node.id)
  }
  const start=async()=>{
   // The embedded neighborhood uses the shared renderer's broadly supported WebGL2 backend.
   if(spatial){const {createNetworkGPU3D}=await import('../../features/ecosystem/webgpu-3d-renderer.js');if(abort.signal.aborted)return;const result=await createNetworkGPU3D(surface,failed,schedule,'3D',()=>speedRef.current,undefined,()=>navigationRef.current==='orbit',{forceWebGL:true});if(abort.signal.aborted){result.dispose();return}gpu=result;surface.dataset.backend=gpu.backend}
   else{planar=createNetworkCanvas(surface);surface.dataset.backend='canvas';bindPlanarNavigation(surface,{zoom:factor=>zoom(1/factor),pan:(x,y)=>{finishTransition();view.x+=x*view.w;view.y+=y*view.h;schedule()},speed:()=>speedRef.current},abort.signal)}
   // The renderer owns 3D pointer/keyboard movement; this layer only selects nodes.
   surface.addEventListener('pointerdown',down,{signal:abort.signal});surface.addEventListener('pointermove',move,{signal:abort.signal});surface.addEventListener('pointerup',up,{signal:abort.signal});surface.addEventListener('pointercancel',cancel,{signal:abort.signal});surface.addEventListener('lostpointercapture',cancel,{signal:abort.signal})
   if(!spatial)surface.addEventListener('wheel',event=>{if(document.activeElement!==surface&&!event.ctrlKey&&!event.metaKey)return;event.preventDefault();zoom(event.deltaY>0?1.2:1/1.2)},{passive:false,signal:abort.signal})
   surface.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();surface.blur()}},{signal:abort.signal})
   controls.current={zoom,fit,focus,stopFocus:()=>gpu?.stopFocus()};initialized=true
   let firstSize=true
   observer=new ResizeObserver(()=>{
    const previousWidth=width; width=element.clientWidth;height=element.clientHeight
    if(gpu)gpu.resize(width,height);else planar?.resize(width,height,devicePixelRatio)
    if(firstSize){
     firstSize=false;fit()
     if(initialView.viewportTop!==undefined){window.scrollBy(0,element.getBoundingClientRect().top-initialView.viewportTop);surface.focus({preventScroll:true})}
     if(initialView.mode===mode){
      if(gpu&&initialView.camera)gpu.restoreCameraView(initialView.camera,byId.get(data.anchor!)!)
      else if(!gpu&&initialView.planarWidth){const w=initialView.planarWidth,h=w*height/width;view={x:-w/2,y:-h/2,w,h}}
     }
    }else if(!gpu){const centerX=view.x+view.w/2,centerY=view.y+view.h/2,w=view.w*width/previousWidth,h=w*height/width;view={x:centerX-w/2,y:centerY-h/2,w,h}}
    schedule()
   });observer.observe(element)
   if(document.activeElement===modeSelect.current)surface.focus({preventScroll:true})
  }
  void start().catch(reason=>failed(reason instanceof Error?reason.message:'The map could not start.'))
  return()=>{replaceData.current=null;abort.abort();observer?.disconnect();cancelAnimationFrame(frame);gpu?.dispose();planar?.dispose();controls.current=null}
 },[mode])
 useEffect(()=>{replaceData.current?.(data)},[data])
 const run=(action:()=>void)=>{action();canvas.current?.focus({preventScroll:true})}
 return <>
  <div className="organization-ecomap-controls">
   <label>Map mode<select aria-label="Map mode" ref={modeSelect} value={mode} onChange={event=>onModeChange(event.target.value as OrganizationMapMode)}><option value="2d">2D</option><option value="3d">3D</option></select></label>
   {mode==='3d'&&<label>Navigation<select aria-label="Navigation" value={navigation} onChange={event=>{setNavigation(event.target.value as 'orbit'|'fly');controls.current?.stopFocus();canvas.current?.focus({preventScroll:true})}}><option value="orbit">Orbit selection</option><option value="fly">Free fly</option></select></label>}
   <button disabled={!ready} onClick={()=>run(()=>controls.current?.zoom(1/1.5))} aria-label="Zoom in on organization map">+</button><button disabled={!ready} onClick={()=>run(()=>controls.current?.zoom(1.5))} aria-label="Zoom out on organization map">−</button><button disabled={!ready} onClick={()=>run(()=>controls.current?.fit())}>Fit all connections</button>
   <label>Speed<select aria-label="Navigation speed" value={speed} onChange={event=>setSpeed(Number(event.target.value))}><option value={.25}>0.25×</option><option value={1}>1×</option><option value={3}>3×</option></select></label>
   <label className="organization-ecomap-find">Find a node<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Organization name"/></label>
  </div>
  {search&&<div className="organization-ecomap-search"><p role="status">{matches.length} matching nodes{matches.length>20?' · Showing the first 20; refine your search.':''}</p>{matches.slice(0,20).map(node=><button disabled={!ready} key={node.id} title={node.name} aria-label={node.name} onClick={()=>controls.current?.focus(node.id)}>{abbreviateBoardLabel(node.name)}</button>)}</div>}
  {status&&<p role="status">{status}</p>}
  {error&&<p role="alert">{error} {mode==='3d'&&<button onClick={()=>onModeChange('2d')}>Use 2D map</button>}</p>}
  <p id={helpId} className="organization-ecomap-keyboard-help">{keyboardActive?'Keyboard navigation active. ':'Click or Tab into the map to navigate. '}{mode==='2d'?'W/S zoom · A/D pan left/right · E/Q pan up/down. Drag to pan.':navigation==='orbit'?'W/S zoom · A/D orbit left/right · E/Q orbit up/down. Drag to orbit.':'W/S forward/back · A/D left/right · E/Q up/down. Drag to look.'} Scroll to zoom. Shift: faster · Ctrl: slower · Esc: release keyboard.</p>
  <div ref={host} className="organization-ecomap-canvas"><canvas key={mode} ref={canvas} tabIndex={0} data-mode={mode} data-anchor={data.anchor||''} aria-describedby={helpId} onFocus={()=>setKeyboardActive(true)} onBlur={()=>setKeyboardActive(false)} aria-label={`${data.organizations.find(n=>n.id===data.anchor)?.name} and all ${data.total} adjacent nodes`} role="img"/><div className="organization-ecomap-labels">{labels.map(label=><button key={label.id} className={label.focus?'focus':''} style={{left:label.x,top:label.y}} title={label.name} aria-label={label.name} onClick={()=>controls.current?.focus(label.id)}>{abbreviateBoardLabel(label.name)}</button>)}</div></div>
 </>
}
