import { transactionVisibility, transactionCounts } from './zoom-visibility.js'
import { quantityEdgeWidths } from './edge-quantity.js'
import { relationshipColor } from './relationship-colors.js'
import {mergeNetworkHistory} from './network-history.js'
import { applyFundHierarchy, foldFundNodes, financialNodePies, pieWedgePath, pieLabel } from './fund-pies.js'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { layoutNetwork } from './ecosystem-physics.js'
import { orgDetails, edgeDetails } from './ecosystem-view.js'
import { loadPortalEvidence, graphRelationships, financialNodeAmounts, financialNodeRadius } from './portal-ecosystem.js'
import { refreshPublicReport } from '../../data/publicOrganization/cache'
export function mountEcosystemNetwork(root, {dataUrl, historyUrl, apiPrefix, portalPath}) {
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
let fittedSvgWidth=1, recordedCounts=new Map()
let data, selected = null, scene, camera, renderer, controls, group, nodes=[], edges=[], meshes=[], labelItems=[], frame=0
let inspectorKey=null, edgeMeshes=[], simulation, lastTick=0, fitted=false
const savedPositions=new Map(), movingEdges=[], movingNodes=[]
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)')
const physicsEnabled=()=>!document.hidden&&!reducedMotion.matches&&$('#live-physics').checked
function motionChange(){lastTick=0;requestRender()}
document.addEventListener('visibilitychange',motionChange,{signal:abort.signal})
reducedMotion.addEventListener('change',motionChange,{signal:abort.signal})
let webgl = false, svg, svgView = { x: -400, y: -400, w: 800, h: 800 }
const radius = n => financialNodeRadius($('#scale-node-finances').checked ? n.financialAmount : null)
const financialLabel = n => n.financialAmount ? `Recorded USD transaction volume: ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n.financialAmount)}; incoming + outgoing; payment unverified${n.financialPie ? '. '+pieLabel(n.financialPie) : ''}` : 'USD volume undisclosed'
function previewNode(org) {
 const key='node:'+org.id;if(inspectorKey===key)return;inspectorKey=key
 $('#network-detail').innerHTML=orgDetails(org,data,{includeCapitalization:$('#include-context').checked});rewriteLinks();if(matchMedia('(max-width:900px)').matches){root.classList.add('eco-inspector-open');root.classList.remove('eco-controls-open');panelState()}
}
function previewEdge(edge) {
 const key='edge:'+edge.id;if(inspectorKey===key)return;inspectorKey=key
 $('#network-detail').innerHTML=edgeDetails(edge,data);rewriteLinks();if(matchMedia('(max-width:900px)').matches){root.classList.add('eco-inspector-open');root.classList.remove('eco-controls-open');panelState()}
}
function bindNodePreview(button,node) {
 button.addEventListener('pointerenter',()=>previewNode(node))
 button.addEventListener('focus',()=>previewNode(node))
}
function select(id) {
 let org = data.organizations.find(o=>o.id===id); if (!org) return
 if(org.administratorId){id=org.administratorId;org=data.organizations.find(o=>o.id===id);if(!org)return}
 selected = id; inspectorKey='node:'+id; $('#neighbors').disabled=false
 $('#network-detail').innerHTML = orgDetails(org,data,{includeCapitalization:$('#include-context').checked}); rewriteLinks();if(matchMedia('(max-width:900px)').matches){root.classList.add('eco-inspector-open');root.classList.remove('eco-controls-open');panelState()}
 const u = new URL(location.href); u.searchParams.set('org',id); history.replaceState(history.state,'',u)
 rebuild()
}
function search() {
 const q = $('#network-search').value.trim().toLowerCase()
 const result = $('#network-results'); result.replaceChildren()
 const matches = data.organizations.filter(o=>!q || `${o.name} ${o.type}`.toLowerCase().includes(q))
 for (const org of matches.slice(0,q ? 20 : 5)) { const b=document.createElement('button'); b.type='button'; b.textContent=org.name; b.addEventListener('click',()=>select(org.id)); result.append(b) }
 if (!matches.length) result.textContent='No matching organization.'
}
function clearGraph() {
 labels.replaceChildren(); labelItems=[]; meshes=[]; edgeMeshes=[]
 if (group) { group.traverse(o=>{o.geometry?.dispose(); if (Array.isArray(o.material)) o.material.forEach(m=>m.dispose()); else o.material?.dispose()}); scene.remove(group) }
 group = new THREE.Group(); scene.add(group)
}
function rebuild() {
 if (!data) return
 inspectorKey=null
 simulation?.stop()
 nodes.forEach(n=>savedPositions.set(n.id,{x:n.x,y:n.y,vx:n.vx,vy:n.vy}))
 movingEdges.length=0;movingNodes.length=0;lastTick=0
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
 status.textContent=`${nodes.length} organizations · ${edges.length} links${webgl ? '' : ' · SVG fallback'}`
 if(webgl) clearGraph()
 else { labels.replaceChildren(); labelItems=[]; svg.replaceChildren() }
 const classKeys=Object.keys(colors), clusters=classKeys.length, spread=230
 const center=n=>{const i=classKeys.indexOf(n.category),a=i/clusters*Math.PI*2;return {x:Math.cos(a)*spread,y:Math.sin(a)*spread}}
 simulation=layoutNetwork(nodes,edges,radius,center,{live:true,attraction:Number($('#attraction').value),repulsion:Number($('#repulsion').value)})
 // A short bounded warmup provides a useful first frame without blocking for convergence.
 if(!fitted)simulation.tick(8)
 if(!webgl) { renderSvg(); if(!fitted){fit();fitted=true} requestRender(); return }
 for(const n of nodes) {
  const r=radius(n), color=n.id===selected?0xe56d3c:colors[n.category]
  const mesh=new THREE.Mesh(n.financialPie?new THREE.CircleGeometry(r,48):new THREE.SphereGeometry(r,16,12),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}))
  if(n.financialPie){
   for(const slice of n.financialPie.slices){
    // SVG angles run clockwise; Three's circles run counterclockwise.
    const sector=new THREE.Mesh(new THREE.CircleGeometry(r,Math.max(3,Math.ceil(slice.share*64)),-slice.endAngle,slice.endAngle-slice.startAngle),new THREE.MeshBasicMaterial({color:new THREE.Color(slice.color),side:THREE.DoubleSide}))
    sector.position.z=.2;mesh.add(sector)
   }
   const ring=new THREE.Mesh(new THREE.RingGeometry(r,r+(n.id===selected?2:1),48),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));ring.position.z=.3;mesh.add(ring)
  }
  mesh.position.set(n.x,n.y,0);mesh.userData.node=n;group.add(mesh);meshes.push(mesh)
  const button=document.createElement('button');button.type='button';button.textContent=n.name;button.title=`${n.name} · ${financialLabel(n)}`;if(n.financialPie){button.dataset.fundingSlices=String(n.financialPie.slices.length);button.dataset.fundingTotal=String(n.financialPie.total);button.setAttribute('aria-label',button.title)}button.setAttribute('aria-pressed',String(n.id===selected));button.addEventListener('click',()=>select(n.id));bindNodePreview(button,n);labels.append(button);labelItems.push({button,n})
 }
 const parallel=new Map()
 for(const edge of edges) {
  const a=new THREE.Vector3(edge.source.x,edge.source.y,0),b=new THREE.Vector3(edge.target.x,edge.target.y,0)
  const pair=`${edge.source.id}-${edge.target.id}`,idx=parallel.get(pair)||0;parallel.set(pair,idx+1)
  const dir=b.clone().sub(a).normalize(),normal=new THREE.Vector3(-dir.y,dir.x,0)
  const start=a.clone().addScaledVector(dir,radius(edge.source)+2),end=b.clone().addScaledVector(dir,-radius(edge.target)-3)
  const midpoint=start.clone().add(end).multiplyScalar(.5).addScaledVector(normal,15+idx*18)
  const curve=new THREE.QuadraticBezierCurve3(start,midpoint,end),points=curve.getPoints(36),color=relationshipColor(edge)
  let visual
  if(edge.relationship==='funding') {
   const width=(edge.quantityWidth || 1.4)/2
   const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,36,width,4,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.5}));mesh.userData.edge=edge;group.add(mesh);edgeMeshes.push(mesh);visual=mesh
  } else {
   const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color,dashSize:edge.relationship==='affiliation'?8:3,gapSize:5,transparent:true,opacity:.65}));line.computeLineDistances();line.userData.edge=edge;group.add(line);edgeMeshes.push(line);visual=line
  }
  const hitMesh=new THREE.Mesh(new THREE.TubeGeometry(curve,36,4,4,false),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));hitMesh.userData.edge=edge;group.add(hitMesh);edgeMeshes.push(hitMesh)
  const tangent=curve.getTangent(1).normalize(),arrow=new THREE.ArrowHelper(tangent,end.clone().addScaledVector(tangent,-8),8,color,7,4);arrow.userData.edge=edge;group.add(arrow);movingEdges.push({edge,idx,visual,hitMesh,arrow,curve})
 }
 if(!fitted){fit();fitted=true} requestRender()
}
function fit() {
 if(!webgl) {
  const xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y),aspect=host.clientWidth/host.clientHeight
  const width=nodes.length?Math.max(...xs)-Math.min(...xs)+120:400,height=nodes.length?Math.max(...ys)-Math.min(...ys)+120:400
  const h=Math.max(height,width/aspect),w=h*aspect,cx=nodes.length?(Math.max(...xs)+Math.min(...xs))/2:0,cy=nodes.length?(Math.max(...ys)+Math.min(...ys))/2:0
  fittedSvgWidth=w; svgView={x:cx-w/2,y:cy-h/2,w,h}; requestRender(); return
 }
 const box=new THREE.Box3().setFromObject(group),center=new THREE.Vector3(),size=new THREE.Vector3()
 if(nodes.length) {box.getCenter(center);box.getSize(size)}
 const aspect=host.clientWidth/host.clientHeight
 const view=Math.max(size.y+100,(size.x+100)/aspect,200)
 camera.left=-view*aspect/2;camera.right=view*aspect/2;camera.top=view/2;camera.bottom=-view/2;camera.zoom=1
 camera.position.set(center.x,center.y,1000);controls.target.copy(center);camera.updateProjectionMatrix();controls.update();requestRender()
}
function render(time=0) {
 frame=0;
 if(simulation&&physicsEnabled()&&simulation.alpha()>simulation.alphaMin()){
  // Fixed 60 Hz integration, at most two steps per frame; discard background catch-up.
  const step=1000/60,elapsed=lastTick?time-lastTick:step
  const steps=Math.min(2,Math.floor((elapsed+.001)/step))
  if(steps>0){simulation.tick(steps);lastTick=lastTick&&elapsed<=2*step?lastTick+steps*step:time;updatePositions()}
 }else lastTick=0;
 const zoom=webgl?camera.zoom:fittedSvgWidth/svgView.w
 const visible=new Set(nodes.filter(n=>n.id===selected||!$('#zoom-sparse').checked||transactionVisibility(recordedCounts.get(n.id)||0,zoom,Number($('#visibility-factor').value))).map(n=>n.id))
 const edgeVisible=e=>visible.has(e.source.id||e.source)&&visible.has(e.target.id||e.target)
 const visibleEdges=new Set(edges.filter(edgeVisible).map(e=>e.id))
 if(webgl){for(const o of group.children){if(o.userData.node)o.visible=visible.has(o.userData.node.id);if(o.userData.edge)o.visible=edgeVisible(o.userData.edge)}renderer.render(scene,camera)}
 else {for(const c of svg.querySelectorAll('[data-node-id]'))c.style.display=visible.has(c.dataset.nodeId)?'':'none';for(const c of svg.querySelectorAll('[data-edge-id]'))c.style.display=visibleEdges.has(c.dataset.edgeId)?'':'none'}
 status.textContent=`${visible.size} visible / ${nodes.length} organizations · ${visibleEdges.size} visible links`
 if(!webgl) svg?.setAttribute('viewBox',`${svgView.x} ${svgView.y} ${svgView.w} ${svgView.h}`)
 const positions=[]
 const priority=[...labelItems].sort((a,b)=>(b.n.id===selected)-(a.n.id===selected)||(b.n.financialAmount??0)-(a.n.financialAmount??0))
 for(const item of priority) {
  const p=webgl?new THREE.Vector3(item.n.x,item.n.y,0).project(camera):new THREE.Vector3((item.n.x-svgView.x)/svgView.w*2-1,1-(item.n.y-svgView.y)/svgView.h*2,0),x=(p.x*.5+.5)*host.clientWidth,y=(-p.y*.5+.5)*host.clientHeight
  const width=Math.min(155,item.n.name.length*5.5+10)
  const overlapping=positions.some(r=>Math.abs(x-r.x)<(width+r.width)/2+8&&Math.abs(y-r.y)<28)
  item.button.hidden=!visible.has(item.n.id)||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1||(overlapping&&item.n.id!==selected)
  if(!item.button.hidden){item.button.style.left=`${x}px`;item.button.style.top=`${y}px`;positions.push({x,y,width})}
 }
 if(simulation&&physicsEnabled()&&simulation.alpha()>simulation.alphaMin())requestRender()
}
function requestRender(){if(!disposed&&!frame)frame=requestAnimationFrame(render)}
function edgePoints(edge,idx) {
 const a=edge.source,b=edge.target,dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d
 const start=new THREE.Vector3(a.x+ux*(radius(a)+2),a.y+uy*(radius(a)+2),0)
 const end=new THREE.Vector3(b.x-ux*(radius(b)+3),b.y-uy*(radius(b)+3),0)
 const middle=start.clone().add(end).multiplyScalar(.5).add(new THREE.Vector3(-uy,ux,0).multiplyScalar(15+idx*18))
 return {start,end,middle}
}
function updateTube(mesh,curve,width) {
 const position=mesh.geometry.attributes.position,point=new THREE.Vector3(),tangent=new THREE.Vector3()
 for(let i=0;i<=36;i++){
  curve.getPoint(i/36,point);curve.getTangent(i/36,tangent).normalize()
  for(let j=0;j<=4;j++){
   const angle=j/4*Math.PI*2,c=Math.cos(angle)*width
   position.setXYZ(i*5+j,point.x-tangent.y*c,point.y+tangent.x*c,Math.sin(angle)*width)
  }
 }
 position.needsUpdate=true;mesh.geometry.computeBoundingSphere()
}
function updatePositions(){
 if(webgl){
  for(const mesh of meshes){const n=mesh.userData.node;mesh.position.set(n.x,n.y,0)}
  for(const item of movingEdges){
   const {start,end,middle}=edgePoints(item.edge,item.idx),curve=item.curve
   curve.v0.copy(start);curve.v1.copy(middle);curve.v2.copy(end)
   if(item.visual.isLine){
    const position=item.visual.geometry.attributes.position,point=new THREE.Vector3()
    for(let i=0;i<=36;i++){curve.getPoint(i/36,point);position.setXYZ(i,point.x,point.y,0)}
    position.needsUpdate=true;item.visual.geometry.computeBoundingSphere();item.visual.computeLineDistances()
   }else updateTube(item.visual,curve,(item.edge.quantityWidth||1.4)/2)
   updateTube(item.hitMesh,curve,4)
   const tangent=curve.getTangent(1).normalize();item.arrow.position.copy(end).addScaledVector(tangent,-8);item.arrow.setDirection(tangent)
  }
 }else{
  for(const {node,n} of movingNodes)node.setAttribute('transform',`translate(${n.x} ${n.y})`)
  for(const {edge,idx,line,hitPath} of movingEdges){const {start:a,end:b,middle:m}=edgePoints(edge,idx),d=`M${a.x},${a.y} Q${m.x},${m.y} ${b.x},${b.y}`;line.setAttribute('d',d);hitPath.setAttribute('d',d)}
 }
}
function svgElement(tag,attrs={}) {
 const el=document.createElementNS('http://www.w3.org/2000/svg',tag)
 for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value))
 return el
}
function cursorPosition(event) {
 const rect=host.getBoundingClientRect()
 return event?{x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))}:{x:.5,y:.5}
}
function zoomSvg(factor, event) {
 const nextWidth=svgView.w/factor
 if(nextWidth<80||nextWidth>4000)return
 const cursor=cursorPosition(event), worldX=svgView.x+cursor.x*svgView.w, worldY=svgView.y+cursor.y*svgView.h
 svgView.w/=factor;svgView.h/=factor
 svgView.x=worldX-cursor.x*svgView.w;svgView.y=worldY-cursor.y*svgView.h;requestRender()
}
function zoomWebgl(factor,event) {
 const cursor=cursorPosition(event), pointer=new THREE.Vector2(cursor.x*2-1,1-cursor.y*2)
 const ray=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,0,1),0)
 camera.updateMatrixWorld();ray.setFromCamera(pointer,camera)
 const before=ray.ray.intersectPlane(plane,new THREE.Vector3())
 camera.zoom=Math.max(.35,Math.min(6,camera.zoom*factor));camera.updateProjectionMatrix();camera.updateMatrixWorld()
 ray.setFromCamera(pointer,camera)
 const after=ray.ray.intersectPlane(plane,new THREE.Vector3())
 if(before&&after){const shift=before.sub(after);camera.position.add(shift);controls.target.add(shift);controls.update()}
 requestRender()
}
function initSvg() {
 svg=svgElement('svg',{'aria-label':'D3 organization network (SVG fallback)',role:'img'})
 svg.style.cssText='width:100%;height:100%;display:block;touch-action:none;cursor:grab'
 host.prepend(svg)
 let drag=null
 svg.addEventListener('pointerdown',event=>{if(event.target.closest('[data-node-id]'))return;drag={x:event.clientX,y:event.clientY,vx:svgView.x,vy:svgView.y};svg.setPointerCapture(event.pointerId)})
 svg.addEventListener('pointermove',event=>{if(!drag)return;svgView.x=drag.vx-(event.clientX-drag.x)/host.clientWidth*svgView.w;svgView.y=drag.vy-(event.clientY-drag.y)/host.clientHeight*svgView.h;requestRender()})
 svg.addEventListener('pointerup',()=>{drag=null});svg.addEventListener('pointercancel',()=>{drag=null})
 resizeObserver=new ResizeObserver(fit); resizeObserver.observe(host)
}
function renderSvg() {
 const defs=svgElement('defs'), marker=svgElement('marker',{id:'eco-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'})
 marker.append(svgElement('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'context-stroke'}));defs.append(marker);svg.append(defs)
 const parallel=new Map()
 for(const edge of edges) {
  const a=edge.source,b=edge.target,dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d
  const pair=`${a.id}-${b.id}`,idx=parallel.get(pair)||0;parallel.set(pair,idx+1)
  const sx=a.x+ux*(radius(a)+2),sy=a.y+uy*(radius(a)+2),tx=b.x-ux*(radius(b)+3),ty=b.y-uy*(radius(b)+3)
  const width=edge.quantityWidth || 1.4
  const line=svgElement('path',{d:`M${sx},${sy} Q${(sx+tx)/2-uy*(15+idx*18)},${(sy+ty)/2+ux*(15+idx*18)} ${tx},${ty}`,fill:'none',stroke:`#${relationshipColor(edge).toString(16).padStart(6,'0')}`,'stroke-width':width,'stroke-opacity':.6,'marker-end':'url(#eco-arrow)'})
  if(edge.relationship!=='funding')line.setAttribute('stroke-dasharray',edge.relationship==='affiliation'?'8 5':'3 5')
  const title=svgElement('title');title.textContent=`${edge.sourceLabel} → ${edge.targetLabel}: ${edge.type} ${edge.amountLabel||''}`;line.setAttribute('data-edge-id',edge.id);line.append(title);line.style.pointerEvents='stroke';line.addEventListener('pointerenter',()=>previewEdge(edge));line.addEventListener('click',()=>previewEdge(edge));line.setAttribute('tabindex','0');line.setAttribute('role','button');line.setAttribute('aria-label',title.textContent);line.addEventListener('focus',()=>previewEdge(edge));svg.append(line)
  const hitPath=svgElement('path',{d:line.getAttribute('d'),fill:'none',stroke:'transparent','stroke-width':12,'vector-effect':'non-scaling-stroke','pointer-events':'stroke','aria-hidden':'true'});hitPath.setAttribute('data-edge-id',edge.id);hitPath.addEventListener('pointerenter',()=>previewEdge(edge));hitPath.addEventListener('click',()=>previewEdge(edge));svg.append(hitPath);movingEdges.push({edge,idx,line,hitPath})
 }
 for(const n of nodes) {
  const color=`#${(n.id===selected?0xe56d3c:colors[n.category]).toString(16).padStart(6,'0')}`,node=svgElement('g',{'data-node-id':n.id,transform:`translate(${n.x} ${n.y})`})
  const title=svgElement('title');title.textContent=`${n.name} · ${financialLabel(n)}`;node.append(title)
  if(n.financialPie){for(const slice of n.financialPie.slices)node.append(svgElement('path',{d:pieWedgePath(0,0,radius(n),slice.startAngle,slice.endAngle),fill:slice.color}));node.append(svgElement('circle',{cx:0,cy:0,r:radius(n),fill:'none',stroke:color,'stroke-width':n.id===selected?2:1}))}
  else node.append(svgElement('circle',{cx:0,cy:0,r:radius(n),fill:color}))
  node.addEventListener('pointerenter',()=>previewNode(n));node.addEventListener('click',()=>select(n.id));svg.append(node);movingNodes.push({node,n})
  const button=document.createElement('button');button.type='button';button.textContent=n.name;button.title=`${n.name} · ${financialLabel(n)}`;if(n.financialPie){button.dataset.fundingSlices=String(n.financialPie.slices.length);button.dataset.fundingTotal=String(n.financialPie.total);button.setAttribute('aria-label',button.title)}button.setAttribute('aria-pressed',String(n.id===selected));button.addEventListener('click',()=>select(n.id));bindNodePreview(button,n);labels.append(button);labelItems.push({button,n})
 }
}
function initWebgl() {
 try {
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(host.clientWidth,host.clientHeight);host.prepend(renderer.domElement)
  scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-500,500,400,-400,1,5000);camera.position.z=1000
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};controls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_PAN};controls.minZoom=.35;controls.maxZoom=6;controls.maxPolarAngle=Math.PI*.8;controls.addEventListener('change',requestRender)
  webgl=true
  resizeObserver=new ResizeObserver(()=>{renderer.setSize(host.clientWidth,host.clientHeight);fit()}); resizeObserver.observe(host)
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();ray.params.Line.threshold=5
  const hit=event=>{const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);const hitNode=ray.intersectObjects(meshes.filter(m=>m.visible),false)[0]?.object;const node=hitNode?.userData.node;if(node)return {node};return {edge:ray.intersectObjects(edgeMeshes.filter(m=>m.visible))[0]?.object.userData.edge}}
  let down=null
  renderer.domElement.addEventListener('pointerdown',ev=>{down={x:ev.clientX,y:ev.clientY}})
  renderer.domElement.addEventListener('pointerup',ev=>{if(down&&Math.hypot(ev.clientX-down.x,ev.clientY-down.y)<6){const hitItem=hit(ev);if(hitItem.node)select(hitItem.node.id);else if(hitItem.edge)previewEdge(hitItem.edge)}down=null})
  renderer.domElement.addEventListener('pointermove',ev=>{const item=hit(ev),n=item.node,tip=$('#network-tooltip');tip.hidden=!n;if(n){tip.textContent=`${n.name} · ${financialLabel(n)}`;previewNode(n)}else if(item.edge)previewEdge(item.edge);renderer.domElement.style.cursor=n||item.edge?'pointer':'grab'})
  renderer.domElement.addEventListener('pointerleave',()=>{$('#network-tooltip').hidden=true})
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();webgl=false;labels.replaceChildren();status.textContent='Graphics unavailable. Use search, details or the Relationships view.'})
 } catch { webgl=false; initSvg() }
}
async function start(){
 try {
  const snapshots=await Promise.all([cachedPublicJson(dataUrl,validateSnapshot),cachedPublicJson(historyUrl,validateSnapshot)])
  const historyData=snapshots[1];data=applyFundHierarchy(mergeNetworkHistory(snapshots[0],historyData)); if(disposed)return; rewriteLinks()
  initWebgl();search()
  root.addEventListener('wheel',event=>{
   if(!host.contains(event.target))return
   event.preventDefault();event.stopPropagation()
   const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?host.clientHeight:1)
   const factor=Math.exp(-Math.max(-300,Math.min(300,pixels))*.002)
   if(!webgl){zoomSvg(factor,event);return}
   zoomWebgl(factor,event)
  },{passive:false,capture:true,signal:abort.signal})
  $('#network-detail').addEventListener('error',event=>{if(event.target.tagName==='IMG'){event.target.hidden=true;const note=document.createElement('p');note.className='eco-note';note.textContent='Published image is currently unavailable.';event.target.after(note)}},true)
  $('#network-search').addEventListener('input',search)
  root.querySelectorAll('[name=node-category],[name=relationship],#include-context,#neighbors,#network-view,#hide-isolated,#scale-node-finances,#scale-edge-quantity').forEach(el=>el.addEventListener('change',rebuild))
  $('#live-physics').checked=!reducedMotion.matches
  $('#live-physics').addEventListener('change',()=>{simulation?.alpha(Math.max(simulation.alpha(),.15));motionChange()})
  for(const name of ['attraction','repulsion'])$('#'+name).addEventListener('input',()=>{
   $('#'+name+'-value').textContent=Number($('#'+name).value).toFixed(1)
   simulation?.stop()
   simulation=layoutNetwork(nodes,edges,radius,()=>({x:0,y:0}),{live:true,attraction:Number($('#attraction').value),repulsion:Number($('#repulsion').value)})
   motionChange()
  })
  $('#zoom-sparse').addEventListener('change',requestRender)
  $('#visibility-factor').addEventListener('input',()=>{$('#visibility-factor-value').textContent=$('#visibility-factor').value;requestRender()})
  $('#network-fit').addEventListener('click',fit)
  for(const [id,factor] of [['#zoom-in',1.25],['#zoom-out',.8]]) $(id).addEventListener('click',()=>{if(!webgl){zoomSvg(factor);return}zoomWebgl(factor)})
  $('#network-reset').addEventListener('click',()=>{selected=null;inspectorKey=null;fitted=false;for(const name of ['attraction','repulsion']){$('#'+name).value='1';$('#'+name+'-value').textContent='1.0'}$('#live-physics').checked=!reducedMotion.matches;root.querySelectorAll('[name=node-category],[name=relationship]').forEach(c=>c.checked=true);$('#network-view').value='all';$('#include-context').checked=false;$('#hide-isolated').checked=true;$('#scale-node-finances').checked=true;$('#scale-edge-quantity').checked=true;$('#zoom-sparse').checked=true;$('#visibility-factor').value='4';$('#visibility-factor-value').textContent='4';$('#neighbors').checked=false;$('#neighbors').disabled=true;$('#network-search').value='';$('#network-detail').innerHTML='<h2>Select an organization</h2><p>Search or select a graph label to explore its evidence.</p>';history.replaceState(history.state,'',location.pathname);search();rebuild()})
  const initial=new URL(location.href).searchParams.get('org');if(initial&&data.organizations.some(n=>n.id===initial)){select(initial)}else rebuild()
  loadPortalEvidence(data, cachedEvidenceFetch,apiPrefix).then(updated=>{if(disposed)return;data=applyFundHierarchy(mergeNetworkHistory(updated,historyData));search();if(selected)select(selected);else rebuild();$('#network-source').textContent=(usingOfflineCopy?'Offline · last checked ':'Checked ')+new Date(oldestCheck).toLocaleString()}).catch(()=>{if(disposed)return;$('#network-source').textContent='Saved public evidence · refresh unavailable'})
 }catch(error){if(disposed)return;status.textContent='Network data is unavailable. Reload to try again or browse the organization directory.';host.hidden=true;console.error(error)}
}
const media=matchMedia('(max-width:900px)')
const panelState=()=>{
 for(const panel of ['controls','inspector']){const open=root.classList.contains('eco-'+panel+'-open');root.querySelector(`[data-panel="${panel}"]`).setAttribute('aria-expanded',String(open))}
}
const responsivePanels=()=>{root.classList.remove('eco-controls-open');root.classList.toggle('eco-inspector-open',!media.matches);panelState()}
responsivePanels();media.addEventListener('change',responsivePanels,{signal:abort.signal})
root.querySelectorAll('[data-panel]').forEach(button=>button.addEventListener('click',()=>{const panel=button.dataset.panel;root.classList.toggle('eco-'+panel+'-open');if(media.matches&&root.classList.contains('eco-'+panel+'-open'))root.classList.remove('eco-'+(panel==='controls'?'inspector':'controls')+'-open');panelState()}))
rewriteLinks(); start();
return () => { disposed=true; simulation?.stop(); abort.abort(); resizeObserver?.disconnect(); cancelAnimationFrame(frame); controls?.dispose();
 group?.traverse(o=>{o.geometry?.dispose(); if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose()}); renderer?.dispose(); root.replaceChildren(); };
}
