import {mountNetworkLawDialogs} from './network-law-dialogs.js'
import {movement4D} from './particle-life-4d.js'
import {shortGroupName} from '../../domain/organization/groupNames'
import {persistNetworkSettings} from './network-settings.js'
import { transactionVisibility, transactionCounts } from './zoom-visibility.js'
import { quantityEdgeWidths } from './edge-quantity.js'
import { relationshipColor } from './relationship-colors.js'
import {mergeNetworkHistory,appendNonprofitEvidence} from './network-history.js'
import { applyFundHierarchy, foldFundNodes, financialNodePies, pieLabel } from './fund-pies.js'
import { createNetworkGPU, curvePoints } from './webgpu-renderer.js'
import { assignEdgeCurvature } from './ecosystem-physics.js'
import { createNetworkLayout } from './network-layout.js'
import { prepareNetworkData, loadSharedNetworkData } from './network-data.js'
import { organizationPreview, relationshipPreview, networkPreviewSummaries } from './ecosystem-view.js'
import { loadPortalEvidence, graphRelationships, financialNodeAmounts, financialNodeRadius } from './portal-ecosystem.js'
import { refreshPublicReport } from '../../data/publicOrganization/cache'
export function mountEcosystemNetworkGPU(root, {dataUrl, historyUrl, apiPrefix, portalPath, renderer: rendererKind = 'webgpu'}) {
const four=rendererKind==='webgpu4d',spatial=four||rendererKind==='webgpu3d'
const abort = new AbortController(); let disposed=false, resizeObserver;
mountNetworkLawDialogs(root,abort.signal)
let oldestCheck=Infinity, usingOfflineCopy=false
const cachedPublicJson = (url, validate) => new Promise((resolve,reject) => {
 let saved
 // Render saved evidence immediately; revalidation updates the shared cache
 // for subsequent views without blocking GPU startup on network latency.
 void refreshPublicReport(url, {signal:abort.signal, validate, onCached:entry=>{
  saved=entry;oldestCheck=Math.min(oldestCheck,entry.checkedAt);resolve(entry.data)
 }}).then(entry=>{
  oldestCheck=Math.min(oldestCheck,entry.checkedAt);resolve(entry.data)
 }).catch(error=>{
  if(saved && !abort.signal.aborted){usingOfflineCopy=true;resolve(saved.data)}
  else reject(error)
 })
})
const validateSnapshot = value => {
 if(!value || !['organizations','relationships','financing'].every(key=>Array.isArray(value[key])))throw new Error('Network data is incomplete')
 return value
}
const sharedEvidenceFetch = async url => {
 let saved
 try {
  const entry=await refreshPublicReport(url.replace(/\/support\?offset=0$/, '/support'), {
   validate:value=>{if(url.includes('/orgs/public?')?!Array.isArray(value):!Array.isArray(value?.records))throw new Error('Public evidence is incomplete');return value},
   onCached:entry=>{saved=entry},
  })
  return {ok:true,status:200,json:async()=>entry.data}
 } catch(error) {
  if(saved)return {ok:true,status:200,json:async()=>saved.data}
  throw error
 }
}
const $ = s => root.querySelector(s)
const rewriteLinks = () => root.querySelectorAll('a[href^="/"]').forEach(a => { const path=a.getAttribute('href'); if(!a.dataset.portalLinked){a.setAttribute('href', path.startsWith('/ecosystem-data/') ? new URL(path.split('/').pop(),historyUrl.startsWith('http')?historyUrl:new URL(historyUrl,location.origin)).pathname : portalPath(path));a.dataset.portalLinked='true'} });

const colors = { ecosystem:0x16847d, company:0x357db7, health:0xc76e57, university:0x8564b3, funding:0xad7b26, general:0x77878c, 'federal-government':0x234c8c, 'state-government':0xa54161 }
const selectedCategories = () => new Set([...root.querySelectorAll('[name=node-category]:checked')].map(c=>c.value))
const selectedRelationships = () => new Set([...root.querySelectorAll('[name=relationship]:checked')].map(c=>c.value))
const host = $('#network-canvas'), labels = $('#network-labels'), status = $('#network-status')
let fittedWidth=1, recordedCounts=new Map()
let preparedData, previewSummaries, data, selected = null, renderer, canvas, nodes=[], edges=[], labelItems=[], frame=0
let inspectorKey=null, simulation, fitted=false, geometryDirty=true, visibilityKey=null, visible=new Set(), visibleEdges=new Set(), labelPriority=[]
const savedPositions=new Map()
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)')
$('#live-physics').checked=!reducedMotion.matches
persistNetworkSettings(root,abort.signal)
$('#camera-speed').addEventListener('input',()=>{$('#camera-speed-value').textContent=Number($('#camera-speed').value).toFixed(1)},{signal:abort.signal})
const physicsEnabled=()=>!document.hidden&&!reducedMotion.matches&&$('#live-physics').checked
let fourthPosition=[0,0,0,0]
function moveFourth(delta){const world=movement4D(delta,['xw','yw','zw'].map(axis=>Number($('#life-'+axis).value)));fourthPosition=fourthPosition.map((v,i)=>v+world[i]);$('#life-w-position').textContent=fourthPosition[3].toFixed(2);applyProjection()}
function applyProjection(){if(four)simulation?.projection(['xw','yw','zw'].map(axis=>Number($('#life-'+axis).value)),Number($('#life-perspective').value),fourthPosition)}
function motionChange(){simulation?.motion(physicsEnabled());requestRender()}
document.addEventListener('visibilitychange',motionChange,{signal:abort.signal})
reducedMotion.addEventListener('change',motionChange,{signal:abort.signal})
let gpuReady = false, view = { x: -400, y: -400, w: 800, h: 800 }
const radius = n => n.renderRadius
const forceOptions=()=>({live:true,attractionLaw:$('#attraction-law').value,repulsionLaw:$('#repulsion-law').value,attractionAlpha:Number($('#attraction-alpha').value),repulsionAlpha:Number($('#repulsion-alpha').value),dimensions:four?4:spatial?3:2,lifeRadius:Number($('#life-radius')?.value??300),lifeFriction:Number($('#life-friction')?.value??.85),lifeSeed:Number($('#life-seed')?.value??1),attraction:Number($('#attraction').value),repulsion:Number($('#repulsion').value),proximity:Number($('#proximity').value),centralGravity:Number($('#central-gravity').value),dither:Number($('#dither').value)})
const financialLabel = n => n.financialAmount ? `Recorded USD transaction volume: ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n.financialAmount)}; incoming + outgoing; payment unverified${n.financialPie ? '. '+pieLabel(n.financialPie) : ''}` : 'USD volume undisclosed'
function previewNode(org) {
 if(selected)return
 const key='node:'+org.id;if(inspectorKey===key)return;inspectorKey=key
 $('#network-detail').innerHTML=organizationPreview(org,previewSummaries);rewriteLinks();if(matchMedia('(max-width:900px)').matches&&!root.classList.contains('eco-controls-open')&&!root.classList.contains('eco-visualization-open')){root.classList.add('eco-inspector-open');root.classList.remove('eco-controls-open');panelState()}
}
function previewEdge(edge) {
 if(selected)return
 const key='edge:'+edge.id;if(inspectorKey===key)return;inspectorKey=key
 $('#network-detail').innerHTML=relationshipPreview(edge,data,previewSummaries);rewriteLinks();if(matchMedia('(max-width:900px)').matches&&!root.classList.contains('eco-controls-open')&&!root.classList.contains('eco-visualization-open')){root.classList.add('eco-inspector-open');root.classList.remove('eco-controls-open');panelState()}
}
function bindNodePreview(button,node) {
 button.addEventListener('pointerenter',()=>previewNode(node))
 button.addEventListener('focus',()=>previewNode(node))
}
function select(id) {
 let org = data.organizations.find(o=>o.id===id); if (!org) return
 if(org.administratorId){id=org.administratorId;org=data.organizations.find(o=>o.id===id);if(!org)return}
 previewSummaries=preparedData?.data===data?preparedData.summaries:networkPreviewSummaries(data)
 selected = id; inspectorKey='node:'+id; $('#neighbors').disabled=false
 $('#network-detail').innerHTML = organizationPreview(org,previewSummaries); rewriteLinks();if(matchMedia('(max-width:900px)').matches&&!root.classList.contains('eco-controls-open')&&!root.classList.contains('eco-visualization-open')){root.classList.add('eco-inspector-open');root.classList.remove('eco-controls-open');panelState()}
 const u = new URL(location.href); u.searchParams.set('org',id); history.replaceState(history.state,'',u)
 refreshSelection()
}
function refreshSelection(){
 for(const {button,n} of labelItems)button.setAttribute('aria-pressed',String(n.id===selected))
 geometryDirty=true;labelPriority=[];requestRender()
}
function unpin() {
 const filtered=$('#neighbors').checked
 selected=null;inspectorKey=null
 $('#neighbors').checked=false;$('#neighbors').disabled=true
 $('#network-detail').innerHTML='<h2>Select an organization</h2><p>Hover a node or edge to preview it, or click a node to pin its details.</p>'
 const u=new URL(location.href);u.searchParams.delete('org');history.replaceState(history.state,'',u)
 if(filtered)rebuild();else refreshSelection()
}
function closeDetails() {
 unpin();panelState()
 root.querySelector('[data-panel="inspector"]').focus()
}
root.addEventListener('keydown',event=>{if(event.key==='Escape'&&root.classList.contains('eco-inspector-open'))closeDetails()},{signal:abort.signal})
function search() {
 const q = $('#network-search').value.trim().toLowerCase()
 const result = $('#network-results'); result.replaceChildren()
 const matches = data.organizations.filter(o=>!q || `${o.name} ${shortGroupName(o.name)} ${o.type}`.toLowerCase().includes(q))
 for (const org of matches.slice(0,q ? 20 : 5)) { const b=document.createElement('button'); b.type='button'; b.textContent=shortGroupName(org.name);b.setAttribute('aria-label',org.name); b.addEventListener('click',()=>select(org.id)); result.append(b) }
 if (!matches.length) result.textContent='No matching organization.'
}
function rebuild() {
 if (!data || !gpuReady) return
 inspectorKey=null
 previewSummaries=preparedData?.data===data?preparedData.summaries:networkPreviewSummaries(data)
 simulation?.stop()
 nodes.forEach(n=>savedPositions.set(n.id,{q:n.q,velocity4:n.velocity4,x:n.x,y:n.y,z:n.z,vx:n.vx,vy:n.vy,vz:n.vz}))
 visibilityKey=null;geometryDirty=true;labelPriority=[]
 const cats=selectedCategories(), rels=selectedRelationships(), context=$('#include-context').checked
 const graphData=preparedData?.data===data?preparedData.folded:foldFundNodes(data)
 const pies=preparedData?.data===data?(context?preparedData.contextPies:preparedData.summaries.pies):financialNodePies(data,{includeCapitalization:context})
 let visible=graphData.organizations.filter(n=>cats.has(n.category))
 let visibleIds=new Set(visible.map(n=>n.id))
 const moneyOnly=$('#network-view').value==='money'
 edges=graphRelationships(graphData,{moneyOnly,includeCapitalization:context}).filter(e=>visibleIds.has(e.source) && visibleIds.has(e.target) && (moneyOnly || rels.has(e.relationship)))
 if ($('#neighbors').checked && selected) {
  const neighbors=new Set([selected]); edges.forEach(e=>{if(e.source===selected)neighbors.add(e.target);if(e.target===selected)neighbors.add(e.source)})
  visible=visible.filter(n=>neighbors.has(n.id)); visibleIds=new Set(visible.map(n=>n.id)); edges=edges.filter(e=>visibleIds.has(e.source)&&visibleIds.has(e.target))
 }
 if ($('#hide-isolated').checked) {
  const connected=new Set(edges.flatMap(e=>[e.source,e.target]))
  visible=visible.filter(n=>connected.has(n.id))
 }
 recordedCounts=transactionCounts(graphRelationships(graphData,{includeCapitalization:context}))
 const amounts=financialNodeAmounts(graphData,{includeCapitalization:context})
 const widths=quantityEdgeWidths(graphRelationships(graphData,{includeCapitalization:context}),$('#scale-edge-quantity').checked)
 nodes=visible.map(n=>({...n,...savedPositions.get(n.id),financialAmount:amounts.get(n.id) ?? null,financialPie:pies.get(n.id) || null})); edges=edges.map(e=>({...e,quantityWidth:widths.get(e.id) ?? 1.4}))
 const scaleFinances=$('#scale-node-finances').checked
 const sizing={algorithm:$('#node-size-algorithm').value,alpha:Number($('#node-size-alpha').value),maxAmount:Math.max(0,...amounts.values())}
 nodes.forEach(n=>{n.renderRadius=financialNodeRadius(scaleFinances?n.financialAmount:null,sizing)})
 status.textContent=`${nodes.length} organizations · ${edges.length} links`
 labels.replaceChildren();labelItems=[]
 simulation=createNetworkLayout(nodes,edges,forceOptions(),physicsEnabled(),()=>{geometryDirty=true;requestRender()});applyProjection()
 assignEdgeCurvature(edges)
 for(const n of nodes){
  const button=document.createElement('button');button.type='button';button.textContent=shortGroupName(n.name)
  if(n.financialPie){button.dataset.fundingSlices=String(n.financialPie.slices.length);button.dataset.fundingTotal=String(n.financialPie.total)}
  button.setAttribute('aria-label',`${n.name} · ${financialLabel(n)}`);button.setAttribute('aria-pressed',String(n.id===selected));button.addEventListener('click',()=>select(n.id));bindNodePreview(button,n);labels.append(button);labelItems.push({button,n,width:Math.min(155,button.textContent.length*5.5+10)})
 }
 if(!fitted){fit();fitted=true}requestRender()
}
function fit(){
 if(spatial){renderer.fit(nodes);requestRender();return}
 const aspect=host.clientWidth/Math.max(1,host.clientHeight),xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y)
 const minX=nodes.length?Math.min(...xs):0,maxX=nodes.length?Math.max(...xs):0,minY=nodes.length?Math.min(...ys):0,maxY=nodes.length?Math.max(...ys):0
 const padding=Math.max(120,(maxY-minY)*.12,(maxX-minX)*.12)
 const height=Math.max(maxY-minY+padding,(maxX-minX+padding)/aspect,200),width=height*aspect
 fittedWidth=width;view={x:(minX+maxX-width)/2,y:(minY+maxY-height)/2,w:width,h:height};requestRender()
}
function render(time=0) {
 frame=0;
 if(!gpuReady)return;
 const zoom=spatial?renderer.zoomLevel():fittedWidth/view.w
 const key=[zoom,selected,$('#show-links').checked,$('#zoom-sparse').checked,$('#visibility-factor').value].join('|')
 const visibilityChanged=key!==visibilityKey
 if(visibilityChanged){
 visibilityKey=key
 visible=new Set(nodes.filter(n=>n.id===selected||!$('#zoom-sparse').checked||transactionVisibility(recordedCounts.get(n.id)||0,zoom,Number($('#visibility-factor').value))).map(n=>n.id))
 const edgeVisible=e=>visible.has(e.source.id||e.source)&&visible.has(e.target.id||e.target)
 visibleEdges=new Set($('#show-links').checked?edges.filter(edgeVisible).map(e=>e.id):[])
 status.textContent=`${visible.size} visible / ${nodes.length} organizations · ${visibleEdges.size} visible links`
 }
 if(geometryDirty||visibilityChanged){updatePositions();geometryDirty=false}
 renderer.render(view)
 // Read layout once before changing any label styles or visibility.
 const viewportWidth=host.clientWidth,viewportHeight=host.clientHeight,positions=[]
 if(!labelPriority.length)labelPriority=[...labelItems].sort((a,b)=>(b.n.id===selected)-(a.n.id===selected)||(b.n.financialAmount??0)-(a.n.financialAmount??0))
 for(const item of labelPriority) {
  if(!visible.has(item.n.id)){item.button.hidden=true;continue}
  const projected=spatial?renderer.project(item.n):null
  const p=projected?{x:projected.x/viewportWidth*2-1,y:1-projected.y/viewportHeight*2,z:projected.visible?0:2}:{x:(item.n.x-view.x)/view.w*2-1,y:1-(item.n.y-view.y)/view.h*2,z:0},x=(p.x*.5+.5)*viewportWidth,y=(-p.y*.5+.5)*viewportHeight
  const width=item.width
  const overlapping=positions.some(r=>Math.abs(x-r.x)<(width+r.width)/2+8&&Math.abs(y-r.y)<28)
  item.button.hidden=!visible.has(item.n.id)||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1||(overlapping&&item.n.id!==selected)
  if(!item.button.hidden){item.button.style.left=`${x}px`;item.button.style.top=`${y}px`;positions.push({x,y,width})}
 }
}
function requestRender(){if(!disposed&&!frame)frame=requestAnimationFrame(render)}
function updatePositions(){
 if(!gpuReady)return
 const width=Number($('#link-width').value),color=$('#custom-link-color').checked?parseInt($('#link-color').value.slice(1),16):null
 renderer.update(nodes,edges.map(edge=>({...edge,quantityWidth:(edge.quantityWidth||1.4)*width})),visible,visibleEdges,selected,colors,color===null?relationshipColor:()=>color)
}
function cursorPosition(event) {
 const rect=host.getBoundingClientRect()
 return event?{x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))}:{x:.5,y:.5}
}
function zoomGPU(factor, event) {
 if(spatial){renderer.zoom(factor);return}
 const zoom=Math.max(.35,Math.min(6,fittedWidth/view.w*factor))
 factor=view.w/(fittedWidth/zoom)
 const cursor=cursorPosition(event), worldX=view.x+cursor.x*view.w, worldY=view.y+cursor.y*view.h
 view.w/=factor;view.h/=factor
 view.x=worldX-cursor.x*view.w;view.y=worldY-cursor.y*view.h;requestRender()
}
async function initGPU(){
 canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%;display:block;touch-action:none;cursor:grab';canvas.setAttribute('aria-label',four?'4D Particle Life organization network':spatial?'3D WebGPU organization network':rendererKind==='canvas'?'Organization network':'Native WebGPU organization network');canvas.dataset.renderer=rendererKind;host.prepend(canvas)
 if(rendererKind==='canvas') {
  const {createNetworkCanvasWorker}=await import('./canvas-renderer-client.js');renderer=createNetworkCanvasWorker(canvas)
 } else if(spatial){const {createNetworkGPU3D}=await import('./webgpu-3d-renderer.js');renderer=await createNetworkGPU3D(canvas,message=>{if(disposed)return;gpuReady=false;simulation?.stop();status.textContent=(four?'4D':'3D')+' WebGPU unavailable: '+message},requestRender,four?'4D':'3D',()=>Number($('#camera-speed').value),moveFourth)}
 else renderer=await createNetworkGPU(canvas,message=>{if(disposed)return;console.error(message);gpuReady=false;simulation?.stop();cancelAnimationFrame(frame);frame=0;status.textContent='WebGPU graphics were lost. Reload to retry, or use the original Graph view.'})
 if(disposed){renderer.dispose();return}canvas.dataset.backend=renderer.backend || rendererKind;gpuReady=true
 const resize=()=>{const width=host.clientWidth,height=host.clientHeight;renderer.resize(width,height);if(spatial){requestRender();return}if(fitted&&!spatial){const nextHeight=view.w/(width/Math.max(1,height));view.y+=(view.h-nextHeight)/2;view.h=nextHeight;requestRender()}}
 resize();resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host)
 const hit=event=>{
  if(spatial)return renderer.hit(event)
  const rect=canvas.getBoundingClientRect(),x=view.x+(event.clientX-rect.left)/rect.width*view.w,y=view.y+(event.clientY-rect.top)/rect.height*view.h
  for(let i=nodes.length-1;i>=0;i--){const n=nodes[i];if(visible.has(n.id)&&Math.hypot(x-n.x,y-n.y)<=radius(n))return {node:n}}
  const tolerance=6*view.w/rect.width
  for(const edge of edges){if(!visibleEdges.has(edge.id))continue;const points=curvePoints(edge)
   for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)))
    if(Math.hypot(x-a.x-t*dx,y-a.y-t*dy)<=Math.max(tolerance,(edge.quantityWidth||1.4)*Number($('#link-width').value)/2))return {edge}
   }
  }return {}
 }
 if(!spatial){
  canvas.tabIndex=0
  canvas.setAttribute('aria-label','2D organization network. W zooms in, S zooms out, A pans left, D pans right, E pans up, Q pans down. Hold Shift for 10× speed.')
  const keys=new Set(),navigationKeys=new Set(['KeyW','KeyS','KeyA','KeyD','KeyE','KeyQ'])
  let navigationFrame=0,lastNavigation=0,boosted=false
  const stopNavigation=()=>{boosted=false;keys.clear();cancelAnimationFrame(navigationFrame);navigationFrame=0;lastNavigation=0}
  const navigate=time=>{
   navigationFrame=0
   if(disposed||!keys.size)return
   const dt=lastNavigation?Math.min((time-lastNavigation)/1000,.05):0;lastNavigation=time
   const speed=Number($('#camera-speed').value)*(boosted?10:1),zoom=Number(keys.has('KeyW'))-Number(keys.has('KeyS'))
   if(zoom)zoomGPU(Math.exp(zoom*1.2*speed*dt))
   const x=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),y=Number(keys.has('KeyQ'))-Number(keys.has('KeyE')),length=Math.hypot(x,y)||1
   view.x+=x/length*view.w*.7*speed*dt;view.y+=y/length*view.h*.7*speed*dt
   requestRender();navigationFrame=requestAnimationFrame(navigate)
  }
  canvas.addEventListener('keydown',event=>{
   boosted=event.shiftKey
   if(!navigationKeys.has(event.code)||event.ctrlKey||event.metaKey||event.altKey)return
   event.preventDefault();keys.add(event.code);if(!navigationFrame)navigationFrame=requestAnimationFrame(navigate)
  },{signal:abort.signal})
  window.addEventListener('keyup',event=>{boosted=event.shiftKey;keys.delete(event.code);if(!keys.size)stopNavigation()},{signal:abort.signal})
  canvas.addEventListener('blur',stopNavigation,{signal:abort.signal});window.addEventListener('blur',stopNavigation,{signal:abort.signal})
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopNavigation()},{signal:abort.signal})
  abort.signal.addEventListener('abort',stopNavigation,{once:true})
 }
 const pointers=new Map();let down=null,drag=null,pinch=null
 const pinchState=()=>{const [a,b]=[...pointers.values()];return {distance:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
 canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;if(!spatial)canvas.focus({preventScroll:true});if(spatial){pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});down=pointers.size===1?{x:event.clientX,y:event.clientY}:null;return}canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});down={x:event.clientX,y:event.clientY};drag={x:event.clientX,y:event.clientY,vx:view.x,vy:view.y};if(pointers.size===2){pinch=pinchState();down=null}},{signal:abort.signal})
 canvas.addEventListener('pointermove',event=>{
  if(!spatial&&pointers.has(event.pointerId)){
   pointers.set(event.pointerId,{x:event.clientX,y:event.clientY})
   if(pointers.size===2){const next=pinchState();if(pinch){zoomGPU(next.distance/Math.max(1,pinch.distance),{clientX:next.x,clientY:next.y});view.x-=(next.x-pinch.x)/host.clientWidth*view.w;view.y-=(next.y-pinch.y)/host.clientHeight*view.h}pinch=next;requestRender()}
   else if(drag){view.x=drag.vx-(event.clientX-drag.x)/host.clientWidth*view.w;view.y=drag.vy-(event.clientY-drag.y)/host.clientHeight*view.h;requestRender()}return
  }
  if(spatial&&(pointers.size>1||(down&&Math.hypot(event.clientX-down.x,event.clientY-down.y)>6)))return
  if(selected)return;const item=hit(event);if(item.node)previewNode(item.node);else if(item.edge)previewEdge(item.edge);canvas.style.cursor=item.node||item.edge?'pointer':'grab'
 },{signal:abort.signal})
 const release=event=>{if(event.type==='pointerup'&&down&&Math.hypot(event.clientX-down.x,event.clientY-down.y)<6){const item=hit(event);if(item.node)select(item.node.id);else if(item.edge)previewEdge(item.edge)}pointers.delete(event.pointerId);down=null;pinch=null;drag=null;if(pointers.size===1){const a=[...pointers.values()][0];drag={x:a.x,y:a.y,vx:view.x,vy:view.y}}}
 canvas.addEventListener('pointerup',release,{signal:abort.signal});canvas.addEventListener('pointercancel',release,{signal:abort.signal})
}
async function start(){
 try {
  const snapshots=await Promise.all([cachedPublicJson(dataUrl,validateSnapshot),cachedPublicJson(historyUrl,validateSnapshot),cachedPublicJson(new URL('ecosystem-nonprofits.json',new URL(historyUrl,location.origin)).href,validateSnapshot)])
  const historyData=appendNonprofitEvidence(snapshots[1],snapshots[2]);data=applyFundHierarchy(mergeNetworkHistory(snapshots[0],historyData)); if(disposed)return; rewriteLinks()
  search();await initGPU();if(disposed)return
  root.addEventListener('wheel',event=>{
   if(!host.contains(event.target))return
   event.preventDefault();event.stopPropagation()
   const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?host.clientHeight:1)
   const factor=Math.exp(-Math.max(-300,Math.min(300,pixels))*.002)
   zoomGPU(factor,event)
  },{passive:false,capture:true,signal:abort.signal})
  $('#network-detail').addEventListener('error',event=>{if(event.target.tagName==='IMG'){event.target.hidden=true;const note=document.createElement('p');note.className='eco-note';note.textContent='Published image is currently unavailable.';event.target.after(note)}},true)
  $('#network-search').addEventListener('input',search)
  root.querySelectorAll('[name=node-category],[name=relationship],#include-context,#neighbors,#network-view,#hide-isolated,#scale-node-finances,#scale-edge-quantity,#node-size-algorithm').forEach(el=>el.addEventListener('change',rebuild))
  $('#live-physics').addEventListener('change',()=>{simulation?.motion(physicsEnabled(),true);requestRender()})
  for(const name of ['attraction','repulsion','proximity','central-gravity','dither','attraction-law','repulsion-law','attraction-alpha','repulsion-alpha'])$('#'+name).addEventListener('input',()=>{
   const output=$('#'+name+'-value');if(output)output.textContent=Number($('#'+name).value).toFixed(1)
   simulation?.stop()
   simulation=createNetworkLayout(nodes,edges,forceOptions(),physicsEnabled(),()=>{geometryDirty=true;requestRender()});applyProjection()
   motionChange()
  })
  if(four){
   for(const id of ['xw','yw','zw','perspective'])$('#life-'+id).addEventListener('input',()=>{$('#life-'+id+'-value').textContent=$('#life-'+id).value;applyProjection()})
   for(const id of ['radius','friction','seed'])$('#life-'+id).addEventListener('change',()=>{simulation?.stop();simulation=createNetworkLayout(nodes,edges,forceOptions(),physicsEnabled(),()=>{geometryDirty=true;requestRender()});applyProjection()})
   $('#network-reset').addEventListener('click',()=>{fourthPosition=[0,0,0,0];$('#life-w-position').textContent='0.00';for(const [id,value] of Object.entries({xw:0,yw:0,zw:0,perspective:.35,radius:300,friction:.85,seed:1})){$('#life-'+id).value=value;const output=$('#life-'+id+'-value');if(output)output.textContent=value}savedPositions.clear();nodes.forEach(n=>{delete n.q;delete n.velocity4})})
  }
  $('#node-size-alpha').addEventListener('input',()=>{$('#node-size-alpha-value').textContent=Number($('#node-size-alpha').value).toFixed(1);rebuild()})
  const linkStyleChanged=()=>{geometryDirty=true;requestRender()}
  $('#link-width').addEventListener('input',()=>{$('#link-width-value').textContent=Number($('#link-width').value).toFixed(2);linkStyleChanged()})
  $('#custom-link-color').addEventListener('change',linkStyleChanged)
  $('#link-color').addEventListener('input',()=>{$('#custom-link-color').checked=true;linkStyleChanged()})
  $('#show-links').addEventListener('change',requestRender)
  $('#zoom-sparse').addEventListener('change',requestRender)
  $('#visibility-factor').addEventListener('input',()=>{$('#visibility-factor-value').textContent=$('#visibility-factor').value;requestRender()})
  $('#network-fit').addEventListener('click',fit)
  for(const [id,factor] of [['#zoom-in',1.25],['#zoom-out',.8]]) $(id).addEventListener('click',()=>zoomGPU(factor))
  $('#network-reset').addEventListener('click',()=>{selected=null;inspectorKey=null;fitted=false;for(const kind of ['attraction','repulsion']){$('#'+kind+'-law').value='power';$('#'+kind+'-alpha').value='1';$('#'+kind+'-alpha-value').textContent='1.0'}for(const name of ['attraction','repulsion','proximity','central-gravity','dither']){const value=['central-gravity','dither'].includes(name)?'0':'1';$('#'+name).value=value;$('#'+name+'-value').textContent=Number(value).toFixed(1)}$('#live-physics').checked=!reducedMotion.matches;root.querySelectorAll('[name=node-category],[name=relationship]').forEach(c=>c.checked=true);$('#network-view').value='all';$('#include-context').checked=false;$('#hide-isolated').checked=true;$('#scale-node-finances').checked=true;$('#node-size-algorithm').value='log';$('#node-size-alpha').value='1';$('#node-size-alpha-value').textContent='1.0';$('#scale-edge-quantity').checked=true;$('#camera-speed').value='1';$('#camera-speed-value').textContent='1.0';$('#link-width').value='1';$('#link-width-value').textContent='1.00';$('#custom-link-color').checked=false;$('#link-color').value='#77878c';$('#show-links').checked=true;$('#zoom-sparse').checked=false;$('#visibility-factor').value='4';$('#visibility-factor-value').textContent='4';$('#neighbors').checked=false;$('#neighbors').disabled=true;$('#network-search').value='';$('#network-detail').innerHTML='<h2>Select an organization</h2>';history.replaceState(history.state,'',location.pathname);search();rebuild()})
  const initial=new URL(location.href).searchParams.get('org');if(initial&&data.organizations.some(n=>n.id===initial)){select(initial);rebuild()}else rebuild()
  loadSharedNetworkData(JSON.stringify([location.origin,dataUrl,historyUrl,apiPrefix]), () => loadPortalEvidence(data, sharedEvidenceFetch,apiPrefix,(base,directory,records)=>prepareNetworkData(base,directory,records,historyData,new AbortController().signal)), abort.signal).then(prepared=>{if(disposed)return;preparedData=prepared;data=prepared.data;search();if(selected)select(selected);rebuild();$('#network-source').textContent=(usingOfflineCopy?'Offline · last checked ':'Checked ')+new Date(oldestCheck).toLocaleString()}).catch(()=>{if(disposed)return;$('#network-source').textContent='Saved public evidence · refresh unavailable'})
 }catch(error){if(disposed)return;status.textContent=error.message || 'WebGPU network unavailable.';host.hidden=true;console.error(error)}
}
const panelState=()=>{
 const active=root.classList.contains('eco-visualization-open')?'visualization':root.classList.contains('eco-controls-open')?'controls':'inspector'
 for(const panel of ['visualization','controls','inspector']){
  const button=root.querySelector(`[data-panel="${panel}"]`),open=panel===active
  button.setAttribute('aria-selected',String(open));button.tabIndex=open?0:-1
  $('#'+button.getAttribute('aria-controls')).hidden=!open
 }
}
const selectPanel=panel=>{for(const name of ['visualization','controls','inspector'])root.classList.toggle('eco-'+name+'-open',name===panel);panelState()}
selectPanel(new URL(location.href).searchParams.get('panel')==='visualization'?'visualization':'inspector')
root.querySelectorAll('[data-graph-type]').forEach(link=>{
 if(link.dataset.graphType===(four?'4d':spatial?'3d':'2d'))link.setAttribute('aria-current','true')
 const org=new URL(location.href).searchParams.get('org');if(org){const url=new URL(link.getAttribute('href'),location.origin);url.searchParams.set('org',org);link.setAttribute('href',url.pathname+url.search)}
})
root.querySelectorAll('[data-panel]').forEach(button=>{
 button.addEventListener('click',()=>selectPanel(button.dataset.panel),{signal:abort.signal})
 button.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
  event.preventDefault()
  const panels=['visualization','controls','inspector'],index=panels.indexOf(button.dataset.panel)
  const panel=panels[event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3]
  selectPanel(panel);root.querySelector(`[data-panel="${panel}"]`).focus()
 },{signal:abort.signal})
})
rewriteLinks(); start();
return () => { disposed=true;simulation?.stop();abort.abort();resizeObserver?.disconnect();cancelAnimationFrame(frame);renderer?.dispose();root.replaceChildren() };
}
