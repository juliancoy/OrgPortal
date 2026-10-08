import { transactionVisibility, transactionCounts } from './zoom-visibility.js'
import { quantityEdgeWidths } from './edge-quantity.js'
import { relationshipColor } from './relationship-colors.js'
import {mergeNetworkHistory} from './network-history.js'
import { applyFundHierarchy, foldFundNodes, financialNodePies, pieLabel } from './fund-pies.js'
import { createNetworkGPU, curvePoints } from './webgpu-renderer.js'
import { assignEdgeCurvature } from './ecosystem-physics.js'
import { createNetworkLayout } from './network-layout.js'
import { organizationPreview, relationshipPreview, networkPreviewSummaries } from './ecosystem-view.js'
import { loadPortalEvidence, graphRelationships, financialNodeAmounts, financialNodeRadius } from './portal-ecosystem.js'
import { refreshPublicReport } from '../../data/publicOrganization/cache'
export function mountEcosystemNetworkGPU(root, {dataUrl, historyUrl, apiPrefix, portalPath, renderer: rendererKind = 'webgpu'}) {
const abort = new AbortController(); let disposed=false, resizeObserver;
let oldestCheck=Infinity, usingOfflineCopy=false
const cachedPublicJson = async (url, validate) => {
 let saved
 try {
  const entry=await refreshPublicReport(url, {signal:abort.signal, validate, onCached:entry=>{saved=entry}})
  oldestCheck=Math.min(oldestCheck,entry.checkedAt);return entry.data
 }catch(error) {
  if(saved && !abort.signal.aborted){usingOfflineCopy=true;oldestCheck=Math.min(oldestCheck,saved.checkedAt);return saved.data}
  throw error
 }
}
const validateSnapshot = value => {
 if(!value || !['organizations','relationships','financing'].every(key=>Array.isArray(value[key])))throw new Error('Network data is incomplete')
 return value
}
const cachedEvidenceFetch = async (url, options) => {
 const cacheUrl=url.replace(/\/support\?offset=0$/, '/support')
 if(cacheUrl.endsWith('/support') || /\/orgs\/public\?limit=500&offset=\d+$/.test(cacheUrl) || /\/relationships\/public\?offset=\d+$/.test(cacheUrl)) {
  const value=await cachedPublicJson(cacheUrl, value=>{
   if(cacheUrl.includes('/orgs/public?') ? !Array.isArray(value) : !Array.isArray(value?.records))throw new Error('Public evidence is incomplete')
   return value
  })
  return {ok:true,json:async()=>value}
 }
 return fetch(url,{...options,signal:abort.signal,credentials:'omit'})
}
const $ = s => root.querySelector(s)
const rewriteLinks = () => root.querySelectorAll('a[href^="/"]').forEach(a => { const path=a.getAttribute('href'); if(!a.dataset.portalLinked){a.setAttribute('href', path.startsWith('/ecosystem-data/') ? new URL(path.split('/').pop(),historyUrl.startsWith('http')?historyUrl:new URL(historyUrl,location.origin)).pathname : portalPath(path));a.dataset.portalLinked='true'} });

const colors = { ecosystem:0x16847d, company:0x357db7, health:0xc76e57, university:0x8564b3, funding:0xad7b26, general:0x77878c, 'federal-government':0x234c8c, 'state-government':0xa54161 }
const selectedCategories = () => new Set([...root.querySelectorAll('[name=node-category]:checked')].map(c=>c.value))
const selectedRelationships = () => new Set([...root.querySelectorAll('[name=relationship]:checked')].map(c=>c.value))
const host = $('#network-canvas'), labels = $('#network-labels'), status = $('#network-status')
let fittedWidth=1, recordedCounts=new Map()
let previewSummaries, data, selected = null, renderer, canvas, nodes=[], edges=[], labelItems=[], frame=0
let inspectorKey=null, simulation, fitted=false, geometryDirty=true, visibilityKey=null, visible=new Set(), visibleEdges=new Set(), labelPriority=[]
const savedPositions=new Map()
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)')
const physicsEnabled=()=>!document.hidden&&!reducedMotion.matches&&$('#live-physics').checked
function motionChange(){simulation?.motion(physicsEnabled());requestRender()}
document.addEventListener('visibilitychange',motionChange,{signal:abort.signal})
reducedMotion.addEventListener('change',motionChange,{signal:abort.signal})
let gpuReady = false, view = { x: -400, y: -400, w: 800, h: 800 }
const radius = n => n.renderRadius
const forceOptions=()=>({live:true,attraction:Number($('#attraction').value),repulsion:Number($('#repulsion').value),proximity:Number($('#proximity').value)})
const financialLabel = n => n.financialAmount ? `Recorded USD transaction volume: ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n.financialAmount)}; incoming + outgoing; payment unverified${n.financialPie ? '. '+pieLabel(n.financialPie) : ''}` : 'USD volume undisclosed'
function previewNode(org) {
 if(selected)return
 const key='node:'+org.id;if(inspectorKey===key)return;inspectorKey=key
 $('#network-detail').innerHTML=organizationPreview(org,previewSummaries);rewriteLinks();if(matchMedia('(max-width:900px)').matches){root.classList.add('eco-inspector-open');root.classList.remove('eco-controls-open');panelState()}
}
function previewEdge(edge) {
 if(selected)return
 const key='edge:'+edge.id;if(inspectorKey===key)return;inspectorKey=key
 $('#network-detail').innerHTML=relationshipPreview(edge,data,previewSummaries);rewriteLinks();if(matchMedia('(max-width:900px)').matches){root.classList.add('eco-inspector-open');root.classList.remove('eco-controls-open');panelState()}
}
function bindNodePreview(button,node) {
 button.addEventListener('pointerenter',()=>previewNode(node))
 button.addEventListener('focus',()=>previewNode(node))
}
function select(id) {
 let org = data.organizations.find(o=>o.id===id); if (!org) return
 if(org.administratorId){id=org.administratorId;org=data.organizations.find(o=>o.id===id);if(!org)return}
 previewSummaries=networkPreviewSummaries(data)
 selected = id; inspectorKey='node:'+id; $('#neighbors').disabled=false
 $('#network-tooltip').hidden=true
 $('#network-detail').innerHTML = '<button type="button" data-unpin-node aria-label="Close pinned organization">Close</button>'+organizationPreview(org,previewSummaries); rewriteLinks();if(matchMedia('(max-width:900px)').matches){root.classList.add('eco-inspector-open');root.classList.remove('eco-controls-open');panelState()}
 const u = new URL(location.href); u.searchParams.set('org',id); history.replaceState(history.state,'',u)
 rebuild()
}
function unpin() {
 selected=null;inspectorKey=null
 $('#neighbors').checked=false;$('#neighbors').disabled=true
 $('#network-detail').innerHTML='<h2>Select an organization</h2><p>Hover a node or edge to preview it, or click a node to pin its details.</p>'
 const u=new URL(location.href);u.searchParams.delete('org');history.replaceState(history.state,'',u)
 rebuild()
}
$('#network-detail').addEventListener('click',event=>{if(event.target.closest('[data-unpin-node]'))unpin()},{signal:abort.signal})
function search() {
 const q = $('#network-search').value.trim().toLowerCase()
 const result = $('#network-results'); result.replaceChildren()
 const matches = data.organizations.filter(o=>!q || `${o.name} ${o.type}`.toLowerCase().includes(q))
 for (const org of matches.slice(0,q ? 20 : 5)) { const b=document.createElement('button'); b.type='button'; b.textContent=org.name; b.addEventListener('click',()=>select(org.id)); result.append(b) }
 if (!matches.length) result.textContent='No matching organization.'
}
function rebuild() {
 if (!data || !gpuReady) return
 inspectorKey=null
 previewSummaries=networkPreviewSummaries(data)
 simulation?.stop()
 nodes.forEach(n=>savedPositions.set(n.id,{x:n.x,y:n.y,vx:n.vx,vy:n.vy}))
 visibilityKey=null;geometryDirty=true;labelPriority=[]
 const cats=selectedCategories(), rels=selectedRelationships(), context=$('#include-context').checked
 const graphData=foldFundNodes(data), pies=financialNodePies(data,{includeCapitalization:context})
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
 nodes.forEach(n=>{n.renderRadius=financialNodeRadius(scaleFinances?n.financialAmount:null)})
 status.textContent=`${nodes.length} organizations · ${edges.length} links`
 labels.replaceChildren();labelItems=[]
 simulation=createNetworkLayout(nodes,edges,forceOptions(),physicsEnabled(),()=>{geometryDirty=true;requestRender()})
 assignEdgeCurvature(edges)
 for(const n of nodes){
  const button=document.createElement('button');button.type='button';button.textContent=n.name;button.title=`${n.name} · ${financialLabel(n)}`
  if(n.financialPie){button.dataset.fundingSlices=String(n.financialPie.slices.length);button.dataset.fundingTotal=String(n.financialPie.total)}
  button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed',String(n.id===selected));button.addEventListener('click',()=>select(n.id));bindNodePreview(button,n);labels.append(button);labelItems.push({button,n})
 }
 if(!fitted){fit();fitted=true}requestRender()
}
function fit(){
 const aspect=host.clientWidth/Math.max(1,host.clientHeight),xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y)
 const minX=nodes.length?Math.min(...xs):0,maxX=nodes.length?Math.max(...xs):0,minY=nodes.length?Math.min(...ys):0,maxY=nodes.length?Math.max(...ys):0
 const height=Math.max(maxY-minY+120,(maxX-minX+120)/aspect,200),width=height*aspect
 fittedWidth=width;view={x:(minX+maxX-width)/2,y:(minY+maxY-height)/2,w:width,h:height};requestRender()
}
function render(time=0) {
 frame=0;
 if(!gpuReady)return;
 const zoom=fittedWidth/view.w
 const key=[zoom,selected,$('#zoom-sparse').checked,$('#visibility-factor').value].join('|')
 const visibilityChanged=key!==visibilityKey
 if(visibilityChanged){
 visibilityKey=key
 visible=new Set(nodes.filter(n=>n.id===selected||!$('#zoom-sparse').checked||transactionVisibility(recordedCounts.get(n.id)||0,zoom,Number($('#visibility-factor').value))).map(n=>n.id))
 const edgeVisible=e=>visible.has(e.source.id||e.source)&&visible.has(e.target.id||e.target)
 visibleEdges=new Set(edges.filter(edgeVisible).map(e=>e.id))
 status.textContent=`${visible.size} visible / ${nodes.length} organizations · ${visibleEdges.size} visible links`
 }
 if(geometryDirty||visibilityChanged){updatePositions();geometryDirty=false}
 renderer.render(view)
 // Read layout once before changing any label styles or visibility.
 const viewportWidth=host.clientWidth,viewportHeight=host.clientHeight,positions=[]
 if(!labelPriority.length)labelPriority=[...labelItems].sort((a,b)=>(b.n.id===selected)-(a.n.id===selected)||(b.n.financialAmount??0)-(a.n.financialAmount??0))
 for(const item of labelPriority) {
  if(!visible.has(item.n.id)){item.button.hidden=true;continue}
  const p={x:(item.n.x-view.x)/view.w*2-1,y:1-(item.n.y-view.y)/view.h*2,z:0},x=(p.x*.5+.5)*viewportWidth,y=(-p.y*.5+.5)*viewportHeight
  const width=Math.min(155,item.n.name.length*5.5+10)
  const overlapping=positions.some(r=>Math.abs(x-r.x)<(width+r.width)/2+8&&Math.abs(y-r.y)<28)
  item.button.hidden=!visible.has(item.n.id)||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1||(overlapping&&item.n.id!==selected)
  if(!item.button.hidden){item.button.style.left=`${x}px`;item.button.style.top=`${y}px`;positions.push({x,y,width})}
 }
}
function requestRender(){if(!disposed&&!frame)frame=requestAnimationFrame(render)}
function updatePositions(){if(gpuReady)renderer.update(nodes,edges,visible,visibleEdges,selected,colors,relationshipColor)}
function cursorPosition(event) {
 const rect=host.getBoundingClientRect()
 return event?{x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))}:{x:.5,y:.5}
}
function zoomGPU(factor, event) {
 const zoom=Math.max(.35,Math.min(6,fittedWidth/view.w*factor))
 factor=view.w/(fittedWidth/zoom)
 const cursor=cursorPosition(event), worldX=view.x+cursor.x*view.w, worldY=view.y+cursor.y*view.h
 view.w/=factor;view.h/=factor
 view.x=worldX-cursor.x*view.w;view.y=worldY-cursor.y*view.h;requestRender()
}
async function initGPU(){
 canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%;display:block;touch-action:none;cursor:grab';canvas.setAttribute('aria-label',rendererKind==='canvas'?'Organization network':'Native WebGPU organization network');canvas.dataset.renderer=rendererKind;host.prepend(canvas)
 if(rendererKind==='canvas') {
  const {createNetworkCanvasWorker}=await import('./canvas-renderer-client.js');renderer=createNetworkCanvasWorker(canvas)
 } else renderer=await createNetworkGPU(canvas,message=>{if(disposed)return;console.error(message);gpuReady=false;simulation?.stop();cancelAnimationFrame(frame);frame=0;status.textContent='WebGPU graphics were lost. Reload to retry, or use the original Graph view.'})
 if(disposed){renderer.dispose();return}gpuReady=true
 const resize=()=>{const width=host.clientWidth,height=host.clientHeight;renderer.resize(width,height);if(fitted){const nextHeight=view.w/(width/Math.max(1,height));view.y+=(view.h-nextHeight)/2;view.h=nextHeight;requestRender()}}
 resize();resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host)
 const hit=event=>{
  const rect=canvas.getBoundingClientRect(),x=view.x+(event.clientX-rect.left)/rect.width*view.w,y=view.y+(event.clientY-rect.top)/rect.height*view.h
  for(let i=nodes.length-1;i>=0;i--){const n=nodes[i];if(visible.has(n.id)&&Math.hypot(x-n.x,y-n.y)<=radius(n))return {node:n}}
  const tolerance=6*view.w/rect.width
  for(const edge of edges){if(!visibleEdges.has(edge.id))continue;const points=curvePoints(edge)
   for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)))
    if(Math.hypot(x-a.x-t*dx,y-a.y-t*dy)<=Math.max(tolerance,(edge.quantityWidth||1.4)/2))return {edge}
   }
  }return {}
 }
 const pointers=new Map();let down=null,drag=null,pinch=null
 const pinchState=()=>{const [a,b]=[...pointers.values()];return {distance:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
 canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});down={x:event.clientX,y:event.clientY};drag={x:event.clientX,y:event.clientY,vx:view.x,vy:view.y};if(pointers.size===2){pinch=pinchState();down=null}},{signal:abort.signal})
 canvas.addEventListener('pointermove',event=>{
  if(pointers.has(event.pointerId)){
   pointers.set(event.pointerId,{x:event.clientX,y:event.clientY})
   if(pointers.size===2){const next=pinchState();if(pinch){zoomGPU(next.distance/Math.max(1,pinch.distance),{clientX:next.x,clientY:next.y});view.x-=(next.x-pinch.x)/host.clientWidth*view.w;view.y-=(next.y-pinch.y)/host.clientHeight*view.h}pinch=next;requestRender()}
   else if(drag){view.x=drag.vx-(event.clientX-drag.x)/host.clientWidth*view.w;view.y=drag.vy-(event.clientY-drag.y)/host.clientHeight*view.h;requestRender()}return
  }
  if(selected)return;const item=hit(event),tip=$('#network-tooltip');tip.hidden=!item.node;if(item.node){tip.textContent=`${item.node.name} · ${financialLabel(item.node)}`;previewNode(item.node)}else if(item.edge)previewEdge(item.edge);canvas.style.cursor=item.node||item.edge?'pointer':'grab'
 },{signal:abort.signal})
 const release=event=>{if(event.type==='pointerup'&&down&&Math.hypot(event.clientX-down.x,event.clientY-down.y)<6){const item=hit(event);if(item.node)select(item.node.id);else if(item.edge)previewEdge(item.edge)}pointers.delete(event.pointerId);down=null;pinch=null;drag=null;if(pointers.size===1){const a=[...pointers.values()][0];drag={x:a.x,y:a.y,vx:view.x,vy:view.y}}}
 canvas.addEventListener('pointerup',release,{signal:abort.signal});canvas.addEventListener('pointercancel',release,{signal:abort.signal});canvas.addEventListener('pointerleave',()=>{$('#network-tooltip').hidden=true},{signal:abort.signal})
}
async function start(){
 try {
  const snapshots=await Promise.all([cachedPublicJson(dataUrl,validateSnapshot),cachedPublicJson(historyUrl,validateSnapshot)])
  const historyData=snapshots[1];data=applyFundHierarchy(mergeNetworkHistory(snapshots[0],historyData)); if(disposed)return; rewriteLinks()
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
  root.querySelectorAll('[name=node-category],[name=relationship],#include-context,#neighbors,#network-view,#hide-isolated,#scale-node-finances,#scale-edge-quantity').forEach(el=>el.addEventListener('change',rebuild))
  $('#live-physics').checked=!reducedMotion.matches
  $('#live-physics').addEventListener('change',()=>{simulation?.motion(physicsEnabled(),true);requestRender()})
  for(const name of ['attraction','repulsion','proximity'])$('#'+name).addEventListener('input',()=>{
   $('#'+name+'-value').textContent=Number($('#'+name).value).toFixed(1)
   simulation?.stop()
   simulation=createNetworkLayout(nodes,edges,forceOptions(),physicsEnabled(),()=>{geometryDirty=true;requestRender()})
   motionChange()
  })
  $('#zoom-sparse').addEventListener('change',requestRender)
  $('#visibility-factor').addEventListener('input',()=>{$('#visibility-factor-value').textContent=$('#visibility-factor').value;requestRender()})
  $('#network-fit').addEventListener('click',fit)
  for(const [id,factor] of [['#zoom-in',1.25],['#zoom-out',.8]]) $(id).addEventListener('click',()=>zoomGPU(factor))
  $('#network-reset').addEventListener('click',()=>{selected=null;inspectorKey=null;fitted=false;for(const name of ['attraction','repulsion','proximity']){$('#'+name).value='1';$('#'+name+'-value').textContent='1.0'}$('#live-physics').checked=!reducedMotion.matches;root.querySelectorAll('[name=node-category],[name=relationship]').forEach(c=>c.checked=true);$('#network-view').value='all';$('#include-context').checked=false;$('#hide-isolated').checked=true;$('#scale-node-finances').checked=true;$('#scale-edge-quantity').checked=true;$('#zoom-sparse').checked=false;$('#visibility-factor').value='4';$('#visibility-factor-value').textContent='4';$('#neighbors').checked=false;$('#neighbors').disabled=true;$('#network-search').value='';$('#network-detail').innerHTML='<h2>Select an organization</h2><p>Search or select a graph label to explore its evidence.</p>';history.replaceState(history.state,'',location.pathname);search();rebuild()})
  const initial=new URL(location.href).searchParams.get('org');if(initial&&data.organizations.some(n=>n.id===initial)){select(initial)}else rebuild()
  loadPortalEvidence(data, cachedEvidenceFetch,apiPrefix).then(updated=>{if(disposed)return;data=applyFundHierarchy(mergeNetworkHistory(updated,historyData));search();if(selected)select(selected);else rebuild();$('#network-source').textContent=(usingOfflineCopy?'Offline · last checked ':'Checked ')+new Date(oldestCheck).toLocaleString()}).catch(()=>{if(disposed)return;$('#network-source').textContent='Saved public evidence · refresh unavailable'})
 }catch(error){if(disposed)return;status.textContent=error.message || 'WebGPU network unavailable.';host.hidden=true;console.error(error)}
}
const media=matchMedia('(max-width:900px)')
const panelState=()=>{
 for(const panel of ['controls','inspector']){const open=root.classList.contains('eco-'+panel+'-open');root.querySelector(`[data-panel="${panel}"]`).setAttribute('aria-expanded',String(open))}
}
const responsivePanels=()=>{root.classList.remove('eco-controls-open');root.classList.toggle('eco-inspector-open',!media.matches);panelState()}
responsivePanels();media.addEventListener('change',responsivePanels,{signal:abort.signal})
root.querySelectorAll('[data-panel]').forEach(button=>button.addEventListener('click',()=>{const panel=button.dataset.panel;root.classList.toggle('eco-'+panel+'-open');if(media.matches&&root.classList.contains('eco-'+panel+'-open'))root.classList.remove('eco-'+(panel==='controls'?'inspector':'controls')+'-open');if(panel==='inspector'&&!root.classList.contains('eco-inspector-open')&&selected)unpin();panelState()}))
rewriteLinks(); start();
return () => { disposed=true;simulation?.stop();abort.abort();resizeObserver?.disconnect();cancelAnimationFrame(frame);renderer?.dispose();root.replaceChildren() };
}
