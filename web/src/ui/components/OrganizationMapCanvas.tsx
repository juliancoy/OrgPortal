import {useEffect,useId,useMemo,useRef,useState,type ReactNode} from 'react'
import {abbreviateBoardLabel} from '../../domain/organization/groupNames'
import {organizationNodeRadius,type MapNode,type MapPage,type PositionedNode,type OrganizationMapLayoutStyle} from '../../features/ecosystem/organizationMap'
import {loadOrganizationMapLayout} from '../../features/ecosystem/organizationMapLayoutClient'
import {volumeColor,volumeColorStops,volumeLabel} from '../../features/ecosystem/volume-color'
import {shortReceivedAmount} from '../../features/ecosystem/received-amount.js'
import {createLabelGrid} from '../../features/ecosystem/label-layout.js'
import {createNetworkCanvas,type CanvasView,type CanvasEdge} from '../../features/ecosystem/canvas-renderer.js'
import {bindPlanarNavigation} from '../../features/ecosystem/planar-navigation.js'
import {OrganizationFinancialBubbles} from './OrganizationFinancialTotals'
import type {Network3DRenderer} from '../../features/ecosystem/webgpu-3d-renderer.js'

import {largestOrganizationParent,type OrganizationMapColorScheme,type OrganizationMapView} from '../../features/ecosystem/organizationMapNavigation'

const incomingColor=0x9b59d0,outgoingColor=0xd55e00
const colors:Record<string,number>={ecosystem:0x16847d,company:0x357db7,health:0xc76e57,university:0x8564b3,funding:0xad7b26,general:0x77878c,'state-government':0xa54161,'federal-government':0x234c8c}
type Controls={zoom:(factor:number)=>void;fit:()=>void;focus:(id:string)=>void;stopFocus:()=>void}
export type OrganizationMapMode='2d'|'3d'
function savedTitlePlacement(){try{return localStorage.getItem('organization-map-title-placement')==='surface'?'surface':'floating'}catch{return 'floating'}}
function savedReceivedAmounts(){try{const value=localStorage.getItem('organization-map-show-received');return value===null?undefined:value==='true'}catch{return undefined}}
function savedHubView(){try{const value=JSON.parse(localStorage.getItem('organization-map-hub-view')||'{}');return {layout:value.layout==='hubs'?'hubs' as const:'radial' as const,hubSpacing:[.8,1,1.5].includes(value.hubSpacing)?Number(value.hubSpacing):1}}catch{return {layout:'radial' as const,hubSpacing:1}}}
export function OrganizationMapCanvas({data,mode,onModeChange,onSelect,initialView,yearControl}:{yearControl?:ReactNode;initialView:OrganizationMapView;data:MapPage;mode:OrganizationMapMode;onModeChange:(mode:OrganizationMapMode)=>void;onSelect:(node:MapNode,view:OrganizationMapView)=>void}){
 const [layout,setLayout]=useState<OrganizationMapLayoutStyle>(initialView.layout||savedHubView().layout),[hubSpacing,setHubSpacing]=useState(initialView.hubSpacing||savedHubView().hubSpacing)
 const layoutOptions=useRef({layout,hubSpacing});layoutOptions.current={layout,hubSpacing}
 useEffect(()=>{try{localStorage.setItem('organization-map-hub-view',JSON.stringify({layout,hubSpacing}))}catch{/* Storage may be disabled. */}},[layout,hubSpacing])
 const [titlePlacement,setTitlePlacement]=useState<'floating'|'surface'>(initialView.titlePlacement||savedTitlePlacement),titlePlacementRef=useRef(titlePlacement)
 titlePlacementRef.current=titlePlacement
 const [showReceived,setShowReceived]=useState(()=>savedReceivedAmounts()??initialView.showReceived??false),showReceivedRef=useRef(showReceived)
 showReceivedRef.current=showReceived
 const [colorScheme,setColorScheme]=useState<OrganizationMapColorScheme>(initialView.colorScheme||'category'),colorSchemeRef=useRef(colorScheme),recolor=useRef<(()=>void)|null>(null)
 colorSchemeRef.current=colorScheme
 const latestData=useRef(data),replaceData=useRef<((next:MapPage)=>void)|null>(null)
 latestData.current=data
 const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),labelLayer=useRef<HTMLDivElement>(null),modeSelect=useRef<HTMLSelectElement>(null),controls=useRef<Controls|null>(null),select=useRef(onSelect)
 select.current=onSelect
 const [navigation,setNavigation]=useState(initialView.navigation),navigationRef=useRef(navigation),[speed,setSpeed]=useState(initialView.speed),speedRef=useRef(speed)
 navigationRef.current=navigation;speedRef.current=speed
 const [search,setSearch]=useState(''),[status,setStatus]=useState(''),[error,setError]=useState(''),[ready,setReady]=useState(false),[attempt,setAttempt]=useState(0)
 const helpId=useId(),[keyboardActive,setKeyboardActive]=useState(false)
 const matches=useMemo(()=>search.trim()?data.organizations.filter(n=>n.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())):[],[search,data])
 const categories=useMemo(()=>[...new Set(data.organizations.map(node=>node.category))].sort(),[data])
 const maxVolume=useMemo(()=>data.organizations.reduce((max,node)=>Number.isFinite(node.financialAmount)?Math.max(max,node.financialAmount!):max,0),[data])
 useEffect(()=>{
  if(!host.current||!canvas.current)return
  const element=host.current,surface=canvas.current,abort=new AbortController(),spatial=mode==='3d'
  let planar:ReturnType<typeof createNetworkCanvas>|undefined,gpu:Network3DRenderer|undefined,observer:ResizeObserver|undefined
  let data=latestData.current
  let nodes:PositionedNode[]=[],byId=new Map<string,PositionedNode>()
  let visible=new Set<string>(),visibleEdges=new Set<string>(),edgeKeys=new Set<string>(),edges:CanvasEdge[]=[]
  let requested:MapPage|null=null,requestedStyle='',layoutAbort:AbortController|undefined,starting:Promise<void>|undefined,layoutPending=false,presented=false
  const buttons:HTMLButtonElement[]=[],layer=labelLayer.current!,projected={x:0,y:0,visible:false,depth:0}
  let width=1,height=1,view:CanvasView={x:-300,y:-200,w:600,h:400},selected=data.anchor!,frame=0,initialized=false,dirty=true
  let transition:{started:number;from:{x:number;y:number;z:number;opacity:number}[];to:typeof nodes;viewFrom:CanvasView;viewTo:CanvasView|null}|null=null
  layer.replaceChildren();setError('');setReady(false);setKeyboardActive(false);setStatus('Arranging connections…')
  const failed=(message:string)=>{if(abort.signal.aborted)return;initialized=false;setError(message);setStatus('');setReady(false);layoutAbort?.abort();abort.abort();observer?.disconnect();cancelAnimationFrame(frame);layer.replaceChildren();delete surface.dataset.ready;surface.blur();controls.current=null;gpu?.dispose();gpu=undefined;planar?.dispose();planar=undefined}
  const draw=()=>{
   frame=0;if(abort.signal.aborted||!initialized)return
   if(transition){
    const t=Math.min(1,(performance.now()-transition.started)/420),ease=t*t*(3-2*t)
    nodes.forEach((node,i)=>{const from=transition!.from[i],to=transition!.to[i];node.x=from.x+(to.x-from.x)*ease;node.y=from.y+(to.y-from.y)*ease;node.z=from.z+(to.z-from.z)*ease;node.opacity=from.opacity+(1-from.opacity)*ease})
    if(transition.viewTo&&!spatial)for(const axis of ['x','y','w','h'] as const)view[axis]=transition.viewFrom[axis]+(transition.viewTo[axis]-transition.viewFrom[axis])*ease
    dirty=true
    if(t<1)schedule();else{transition=null;delete surface.dataset.transitioning}
   }
   const scale=width/view.w
   if(!spatial)for(const node of nodes)node.renderRadius=organizationNodeRadius(node.financialAmount,scale)
   if(dirty||!spatial)(gpu||planar)?.update(nodes,edges,visible,visibleEdges,selected,colors,e=>e.source.id===data.anchor||byId.get(e.source.id)?.direction==='outgoing'?outgoingColor:incomingColor)
   dirty=false
   if(gpu){if(!gpu.render())return}else planar?.render(view)
   if(!layoutPending)surface.dataset.ready='true'
   if(!presented){presented=true;setReady(true)}
   const grid=createLabelGrid(showReceivedRef.current?48:28);let placed=0
   // Layout order already puts the selected anchor first. Reuse a bounded pool
   // of buttons; camera movement changes styles without rebuilding React trees.
   for(const node of nodes){
    // Surface mode never adds floating labels in 3D. In 2D, small circles
    // retain centered native text only when the canvas cannot paint it legibly.
    if(titlePlacementRef.current==='surface'&&(spatial||planar?.hasSurfaceTitle(node.id)))continue
    if(gpu&&!gpu.project(node,projected).visible)continue
    const onCircle=!gpu&&titlePlacementRef.current==='surface'
    const x=gpu?projected.x:(node.x-view.x)*scale;let y=gpu?projected.y+12:(node.y-view.y)*height/view.h+(onCircle?0:node.renderRadius*scale+6);const focus=node.id===data.anchor||node.id===selected
    if(x<30||x>width-30||y<0||y>height-(showReceivedRef.current?48:25))continue
    const labelWidth=onCircle?Math.max(80,Math.min(125,node.renderRadius*scale*1.65)):117
    if(!focus&&grid.overlaps(x,y,labelWidth)){
     // Keep branch junctions identifiable when their lower label meets the
     // anchor's label. Try above the marker before yielding to nearby leaves.
     const above=y-(showReceivedRef.current?64:44)
     if(!onCircle&&node.hubChildren&&above>=0&&!grid.overlaps(x,above,labelWidth))y=above
     else continue
    }
    grid.add(x,y,labelWidth)
    let button=buttons[placed]
    if(!button){button=document.createElement('button');button.type='button';button.addEventListener('click',()=>controls.current?.focus(button.dataset.nodeId!),{signal:abort.signal});buttons.push(button);layer.append(button)}
    const volume=String(node.financialAmount??'')
    const received=showReceivedRef.current?shortReceivedAmount(node.receivedUsd):''
    if(button.dataset.nodeId!==node.id||button.dataset.volume!==volume||button.dataset.colorScheme!==colorSchemeRef.current||button.dataset.received!==String(showReceivedRef.current?node.receivedUsd??'unknown':'hidden')){
     button.dataset.nodeId=node.id;button.dataset.volume=volume;button.dataset.colorScheme=colorSchemeRef.current;button.dataset.received=String(showReceivedRef.current?node.receivedUsd??'unknown':'hidden')
     const name=document.createElement('span');name.className='organization-ecomap-label-name';name.textContent=abbreviateBoardLabel(node.name);button.replaceChildren(name)
     if(received){const amount=document.createElement('span');amount.className='organization-ecomap-label-amount';amount.textContent=received;button.append(amount)}
     button.title=(colorSchemeRef.current==='volume'?`${node.name} · ${volumeLabel(node.financialAmount)}`:node.name)+(received?` · Received USD: ${Number.isFinite(node.receivedUsd)?node.receivedUsd!.toLocaleString('en-US',{maximumFractionDigits:2}):'unavailable'}`:'');button.setAttribute('aria-label',node.name)
    }
    button.hidden=false;button.classList.toggle('focus',focus);button.classList.toggle('on-circle',onCircle);button.style.width=onCircle?`${labelWidth}px`:'';button.style.left=`${Math.round(x)}px`;button.style.top=`${Math.round(y)}px`
    if(++placed>=45)break
   }
   for(let i=placed;i<buttons.length;i++)buttons[i].hidden=true
  }
  const schedule=()=>{if(!abort.signal.aborted&&!frame)frame=requestAnimationFrame(draw)}
  const finishTransition=()=>{
   if(!transition)return
   nodes.forEach((node,i)=>Object.assign(node,transition!.to[i]));if(transition.viewTo&&!spatial)view={...transition.viewTo};transition=null;dirty=true;delete surface.dataset.transitioning
  }
  const applyColors=(targets:PositionedNode[])=>{
   const maximum=targets.reduce((max,node)=>Number.isFinite(node.financialAmount)?Math.max(max,node.financialAmount!):max,0)
   for(const node of targets){node.volumeColor=colorSchemeRef.current==='volume'?volumeColor(node.financialAmount,maximum):(colors[node.category]??colors.general);node.sphereTitle=titlePlacementRef.current==='surface'?abbreviateBoardLabel(node.name):undefined;node.sphereSubtitle=titlePlacementRef.current==='surface'&&showReceivedRef.current?shortReceivedAmount(node.receivedUsd):undefined}
  }
  recolor.current=()=>{applyColors(nodes);if(transition)applyColors(transition.to);dirty=true;schedule()}
  const fitView=(targets:PositionedNode[]):CanvasView=>{const extentX=Math.max(150,...targets.map(n=>Math.abs(n.x)+n.renderRadius))+50,extentY=Math.max(150,...targets.map(n=>Math.abs(n.y)+n.renderRadius))+50,scale=Math.min(width/(extentX*2),height/(extentY*2));return {x:-width/scale/2,y:-height/scale/2,w:width/scale,h:height/scale}}
  const applyLayout=(next:MapPage,targets:PositionedNode[],refit=false)=>{
   applyColors(targets)
   const recenter=next.anchor!==data.anchor,old=byId,origin=old.get(next.anchor!)||{x:0,y:0,z:0}
   data=next;selected=next.anchor!;drag=null
   nodes=initialized?targets.map(node=>({...node,...(old.has(node.id)?{x:old.get(node.id)!.x,y:old.get(node.id)!.y,z:old.get(node.id)!.z}:{x:origin.x,y:origin.y,z:origin.z}),opacity:old.has(node.id)?1:0})):targets
   byId=new Map(nodes.map(node=>[node.id,node]));visible=new Set(byId.keys());visibleEdges=new Set(next.relationships.map(e=>e.id))
   edgeKeys=new Set(next.relationships.map(e=>JSON.stringify([e.source,e.target])))
   const paymentPairs=new Set(next.relationships.filter(e=>!e.hierarchy).map(e=>JSON.stringify([e.source,e.target])))
   edges=next.relationships.map(e=>({id:e.id,source:byId.get(e.source)!,target:byId.get(e.target)!,relationship:e.kinds.every(k=>k==='agency'||k==='affiliation')?'affiliation':'funding',directional:true,quantityWidth:1.4,opacity:.65,curveOffset:e.hierarchy&&paymentPairs.has(JSON.stringify([e.source,e.target]))?-25:edgeKeys.has(JSON.stringify([e.target,e.source]))?25:0}))
   surface.dataset.anchor=next.anchor||'';dirty=true;if(recenter)setSearch('');setStatus('')
   if(!initialized)return
   transition={started:performance.now(),from:nodes.map(n=>({x:n.x,y:n.y,z:n.z,opacity:n.opacity})),to:targets,viewFrom:{...view},viewTo:refit?fitView(targets):recenter?{...view,x:-view.w/2,y:-view.h/2}:null}
   surface.dataset.transitioning='true';surface.dataset.anchor=next.anchor||'';dirty=true;if(recenter)setSearch('')
   const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
   if(gpu&&refit){const previous=gpu.cameraView();gpu.fit(targets);const fitted=gpu.cameraView(),ratio=Math.hypot(...fitted.offset)/Math.max(1,Math.hypot(...previous.offset));gpu.restoreCameraView({...fitted,offset:previous.offset.map(v=>v*ratio) as [number,number,number],up:previous.up},targets.find(n=>n.id===next.anchor)!)}
   if(gpu&&recenter)gpu.focus(targets.find(node=>node.id===next.anchor)!,reduced)
   if(reduced){finishTransition();if(recenter){view.x=-view.w/2;view.y=-view.h/2}}
   schedule()
  }
  const requestLayout=(next:MapPage)=>{
   const options={...layoutOptions.current},style=JSON.stringify(options),refit=!!requestedStyle&&style!==requestedStyle
   if(next===requested&&style===requestedStyle)return
   requestedStyle=style;requested=next;layoutAbort?.abort();const task=layoutAbort=new AbortController()
   layoutPending=true;surface.dataset.layoutPending='true';delete surface.dataset.ready;setStatus('Arranging connections…')
   void loadOrganizationMapLayout(next,mode,task.signal,options).then(targets=>{
    if(abort.signal.aborted||task.signal.aborted)return
    layoutPending=false;delete surface.dataset.layoutPending;applyLayout(next,targets,refit)
    starting??=start().catch(reason=>failed(reason instanceof Error?reason.message:'The map could not start.'))
   }).catch(reason=>{if(!abort.signal.aborted&&!task.signal.aborted)failed(reason instanceof Error?reason.message:'The layout could not start.')})
  }
  replaceData.current=requestLayout
  const fit=()=>{
   finishTransition()
   selected=data.anchor!;dirty=true
   if(gpu){gpu.fit(nodes);gpu.focus(byId.get(data.anchor!)!,true)}
   else view=fitView(nodes)
   schedule()
  }
  const zoom=(factor:number)=>{finishTransition();if(gpu)gpu.zoom(1/factor);else{const next=Math.max(50,Math.min(2e6,view.w*factor)),ratio=next/view.w;view={x:view.x+view.w*(1-ratio)/2,y:view.y+view.h*(1-ratio)/2,w:next,h:view.h*ratio}}schedule()}
  const focus=(id:string)=>{
   surface.focus({preventScroll:true})
   const node=id===data.anchor?largestOrganizationParent(data):byId.get(id);if(!node)return
   select.current(node,{viewportTop:element.getBoundingClientRect().top,mode,...layoutOptions.current,titlePlacement:titlePlacementRef.current,showReceived:showReceivedRef.current,colorScheme:colorSchemeRef.current,navigation:navigationRef.current,speed:speedRef.current,...(gpu?{camera:gpu.cameraView()}:{planarWidth:view.w})})
  }
  const pointers=new Set<number>()
  let drag:{id:number;x:number;y:number;slop:number;moved:boolean;view:CanvasView}|null=null
  const down=(event:PointerEvent)=>{pointers.add(event.pointerId);if(pointers.size>1){drag=null;return}if(event.button!==0||!event.isPrimary)return;finishTransition();surface.focus({preventScroll:true});drag={id:event.pointerId,x:event.clientX,y:event.clientY,slop:event.pointerType==='touch'?12:6,moved:false,view:{...view}};if(!spatial)surface.setPointerCapture(event.pointerId)}
  const move=(event:PointerEvent)=>{if(!drag||event.pointerId!==drag.id)return;drag.moved ||= Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>=drag.slop;if(spatial||!drag.moved)return;view={...drag.view,x:drag.view.x-(event.clientX-drag.x)*drag.view.w/width,y:drag.view.y-(event.clientY-drag.y)*drag.view.h/height};schedule()}
  const cancel=(event:PointerEvent)=>{pointers.delete(event.pointerId);if(event.pointerId===drag?.id)drag=null}
  const up=(event:PointerEvent)=>{
   pointers.delete(event.pointerId)
   if(!drag||event.pointerId!==drag.id)return
   const click=!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<drag.slop
   // Pick where the finger landed, before the small movement of a normal tap.
   const hit={clientX:drag.x,clientY:drag.y,pointerType:event.pointerType};drag=null
   if(!spatial&&surface.hasPointerCapture(event.pointerId))surface.releasePointerCapture(event.pointerId)
   if(!click)return
   if(gpu){const node=gpu.hit(hit).node;if(node)focus(node.id);return}
   const rect=surface.getBoundingClientRect(),x=view.x+(hit.clientX-rect.left)*view.w/width,y=view.y+(hit.clientY-rect.top)*view.h/height
   const nearest=nodes.reduce<{node:typeof nodes[number]|null;distance:number}>((best,node)=>{const distance=Math.hypot(node.x-x,node.y-y);return distance<best.distance?{node,distance}:best},{node:null,distance:Infinity})
   if(nearest.node&&nearest.distance<Math.max(nearest.node.renderRadius,12*view.w/width))focus(nearest.node.id)
  }
  const start=async()=>{
   // The embedded neighborhood uses the shared renderer's broadly supported WebGL2 backend.
   if(spatial){const {createNetworkGPU3D}=await import('../../features/ecosystem/webgpu-3d-renderer.js');if(abort.signal.aborted)return;const result=await createNetworkGPU3D(surface,failed,schedule,'3D',()=>speedRef.current,undefined,()=>navigationRef.current==='orbit',{forceWebGL:true,adaptiveDetail:true});if(abort.signal.aborted){result.dispose();return}gpu=result;surface.dataset.backend=gpu.backend}
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
  requestLayout(data)
  return()=>{replaceData.current=null;recolor.current=null;layoutAbort?.abort();abort.abort();observer?.disconnect();cancelAnimationFrame(frame);gpu?.dispose();planar?.dispose();layer.replaceChildren();controls.current=null}
 },[mode,attempt])
 useEffect(()=>{replaceData.current?.(data)},[data,layout,hubSpacing])
 useEffect(()=>{recolor.current?.()},[colorScheme,titlePlacement,showReceived])
 const run=(action:()=>void)=>{action();canvas.current?.focus({preventScroll:true})}
 return <>
  <div className="organization-ecomap-controls">
   <div className="organization-ecomap-settings">
   {yearControl}
   <label>Map mode<select aria-label="Map mode" ref={modeSelect} value={mode} onChange={event=>onModeChange(event.target.value as OrganizationMapMode)}><option value="2d">2D</option><option value="3d">3D</option></select></label>
   <label>Layout<select aria-label="Map layout" value={layout} onChange={event=>setLayout(event.target.value as OrganizationMapLayoutStyle)}><option value="radial">Radial</option><option value="hubs">Hub particles</option></select></label>
   {layout==='hubs'&&<label>Hub spacing<select aria-label="Hub spacing" value={hubSpacing} onChange={event=>setHubSpacing(Number(event.target.value))}><option value={.8}>Compact</option><option value={1}>Balanced</option><option value={1.5}>Spread out</option></select></label>}
   <label>Color by<select aria-label="Color by" value={colorScheme} onChange={event=>setColorScheme(event.target.value as OrganizationMapColorScheme)}><option value="category">Category</option><option value="volume">Dollar volume</option></select></label>
   <label>Titles<select aria-label="Title placement" value={titlePlacement} onChange={event=>{const value=event.target.value as 'floating'|'surface';setTitlePlacement(value);try{localStorage.setItem('organization-map-title-placement',value)}catch{/* Storage may be disabled. */}}}><option value="floating">Floating labels</option><option value="surface">{mode==='2d'?'On circles':'On spheres'}</option></select></label>
   <label>Received USD<select aria-label="Received amounts" value={showReceived?'show':'hide'} onChange={event=>{const value=event.target.value==='show';setShowReceived(value);try{localStorage.setItem('organization-map-show-received',String(value))}catch{/* Storage may be disabled. */}}}><option value="hide">Hidden</option><option value="show">Show amounts</option></select></label>
   {mode==='3d'&&<label>Navigation<select aria-label="Navigation" value={navigation} onChange={event=>{setNavigation(event.target.value as 'orbit'|'fly');controls.current?.stopFocus();canvas.current?.focus({preventScroll:true})}}><option value="orbit">Orbit selection</option><option value="fly">Free fly</option></select></label>}
   </div>
   <div className="organization-ecomap-actions">
   <label className="organization-ecomap-find">Find a node<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Organization name"/></label>
   <div className="organization-ecomap-zoom" role="group" aria-label="Map zoom"><button disabled={!ready} onClick={()=>run(()=>controls.current?.zoom(1/1.5))} aria-label="Zoom in on organization map">+</button><button disabled={!ready} onClick={()=>run(()=>controls.current?.zoom(1.5))} aria-label="Zoom out on organization map">−</button><button disabled={!ready} onClick={()=>run(()=>controls.current?.fit())} aria-label="Fit all connections">Fit</button></div>
   <label className="organization-ecomap-speed">Speed<select aria-label="Navigation speed" value={speed} onChange={event=>setSpeed(Number(event.target.value))}><option value={.25}>0.25×</option><option value={1}>1×</option><option value={3}>3×</option></select></label>
   </div>
  </div>
  {search&&<div className="organization-ecomap-search"><p role="status">{matches.length} matching nodes{matches.length>20?' · Showing the first 20; refine your search.':''}</p>{matches.slice(0,20).map(node=><button disabled={!ready} key={node.id} title={node.name} aria-label={node.name} onClick={()=>controls.current?.focus(node.id)}>{abbreviateBoardLabel(node.name)}</button>)}</div>}
  {colorScheme==='volume'?<div className="organization-ecomap-volume-legend" aria-label="Node colors: recorded USD volume, logarithmic black-body scale">
   <span>Node color: recorded USD volume · log scale</span><span className="organization-ecomap-volume-ramp" aria-hidden="true" style={{background:`linear-gradient(to right,${volumeColorStops.join(',')})`}}/><span>$0 → {maxVolume>0?volumeLabel(maxVolume):'no disclosed amounts'}</span><span>Gray: undisclosed · blue outline: selected</span>
  </div>:<div className="organization-ecomap-category-legend" aria-label="Node colors: organization categories"><span>Node color: category</span>{categories.map(category=><span key={category}><i aria-hidden="true" style={{background:`#${(colors[category]??colors.general).toString(16).padStart(6,'0')}`}}/>{category.replaceAll('-',' ')}</span>)}<span><i aria-hidden="true" style={{border:'2px solid #57c7ff'}}/>Selected outline</span></div>}
  {layout==='hubs'&&<p className="organization-ecomap-note">Hub particles clusters each branch around its connecting hub. Choose 2 or 3 parent or child levels to see secondary hubs. Shared connections keep their arrows; clusters are layout guides, not ownership groups.</p>}
  {status&&<p role="status">{status}</p>}
  {error&&<p role="alert">{error} <button onClick={()=>setAttempt(n=>n+1)}>Retry layout</button> {mode==='3d'&&<button onClick={()=>onModeChange('2d')}>Use 2D map</button>}</p>}
  {showReceived&&<p className="organization-ecomap-note">Label amounts: recorded USD received. 0 means no net receipts in this snapshot; — means unavailable. Spending, budgets and awards are separate.</p>}
  <details className="organization-ecomap-help"><summary>Map help<span>{keyboardActive?'Keyboard active · Esc to release':'Navigation & reading the map'}</span></summary>
   <p>Click a node to open its page. Click the selected node to open its largest incoming parent by recorded USD volume. Parent and child levels follow upstream and downstream arrows, up to three connections away.</p>
  <p id={helpId} className="organization-ecomap-keyboard-help">{keyboardActive?'Keyboard navigation active. ':'Click or Tab into the map to navigate. '}{mode==='2d'?'W/S zoom · A/D pan left/right · E/Q pan up/down. Drag to pan.':navigation==='orbit'?'W/S zoom · A/D orbit left/right · E/Q orbit up/down. Drag to orbit.':'W/S forward/back · A/D left/right · E/Q up/down. Drag to look.'} Scroll to zoom. Shift: faster · Ctrl: slower · Esc: release keyboard.</p>
  <p className="organization-ecomap-note">Node size: recorded USD volume · logarithmic scale. {layout==='hubs'?'Branch springs and repulsion separate hubs; the particles settle after each layout change.':'Larger volumes are pulled closer to the center.'} Zero or undisclosed amounts use the smallest marker. Blue outline: selected organization.{titlePlacement==='surface'&&' Titles stay on the sphere surface. Find a node searches every connection.'} Gold amounts show recorded USD received for the selected fiscal year (K: thousand, M: million, B: billion, T: trillion). A dash means unavailable. Awards are excluded.</p>
  </details>
  <div className="organization-ecomap-stage"><div ref={host} className="organization-ecomap-canvas"><canvas key={`${mode}-${attempt}`} ref={canvas} tabIndex={0} data-mode={mode} data-layout={layout} data-hub-spacing={hubSpacing} data-anchor={data.anchor||''} aria-describedby={helpId} onFocus={()=>setKeyboardActive(true)} onBlur={()=>setKeyboardActive(false)} aria-label={`${data.organizations.find(n=>n.id===data.anchor)?.name} and all ${data.total} adjacent nodes`} role="img"/><div ref={labelLayer} className="organization-ecomap-labels"/></div><OrganizationFinancialBubbles totals={data.financialTotals} fy={data.fy}/></div>
 </>
}
