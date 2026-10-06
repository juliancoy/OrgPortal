import { relationshipColor } from './relationship-colors.js'
import {mergeNetworkHistory} from './network-history.js'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { layoutNetwork } from './ecosystem-physics.js'
import { orgDetails, relationshipTable } from './ecosystem-view.js'
import { loadPortalEvidence, graphRelationships, financialNodeAmounts, financialNodeRadius } from './portal-ecosystem.js'
export function mountEcosystemNetwork(root, {dataUrl, historyUrl, apiPrefix, portalPath}) {
const abort = new AbortController(); let disposed=false, resizeObserver;
const $ = s => root.querySelector(s)
const rewriteLinks = () => root.querySelectorAll('a[href^="/"]').forEach(a => { const path=a.getAttribute('href'); if(!a.dataset.portalLinked){a.setAttribute('href', path.startsWith('/ecosystem-data/') ? new URL(path.split('/').pop(),historyUrl.startsWith('http')?historyUrl:new URL(historyUrl,location.origin)).pathname : portalPath(path));a.dataset.portalLinked='true'} });

const colors = { ecosystem:0x16847d, company:0x357db7, health:0xc76e57, university:0x8564b3, funding:0xad7b26, general:0x77878c }
const selectedCategories = () => new Set([...root.querySelectorAll('[name=node-category]:checked')].map(c=>c.value))
const selectedRelationships = () => new Set([...root.querySelectorAll('[name=relationship]:checked')].map(c=>c.value))
const host = $('#network-canvas'), labels = $('#network-labels'), status = $('#network-status')
let data, selected = null, scene, camera, renderer, controls, group, nodes=[], edges=[], meshes=[], labelItems=[], frame=0
let webgl = false, svg, svgView = { x: -400, y: -400, w: 800, h: 800 }
const radius = n => financialNodeRadius(n.financialAmount)
const financialLabel = n => n.financialAmount ? `Largest disclosed funding/award: ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n.financialAmount)}; payment unverified` : 'Funding amount undisclosed'
function applyTable() {
 const scope = $('#table-scope').value
 root.querySelectorAll('.eco-table tbody tr').forEach(row => {
  row.hidden = ($('#network-view').value==='money' && row.dataset.kind!=='transfer' && !($('#include-context').checked && row.dataset.kind==='capitalization')) || (scope === 'selected' ? !selected || (row.dataset.source !== selected && row.dataset.target !== selected) : Boolean(scope && row.dataset.kind !== scope && row.dataset.relationship !== scope))
 })
}
function select(id) {
 const org = data.organizations.find(o=>o.id===id); if (!org) return
 selected = id; $('#neighbors').disabled=false
 $('#network-detail').innerHTML = orgDetails(org,data); rewriteLinks()
 const u = new URL(location.href); u.searchParams.set('org',id); history.replaceState(history.state,'',u)
 renderEvents(); applyTable(); rebuild()
}
let eventLimit=100
function renderEvents(){
 const section=$('#network-events');if(!section)return
 const query=$('#event-search').value.trim().toLowerCase(),scope=$('#event-org-only').checked?selected:null
 const events=(data.events || []).filter(event=>(!scope || event.organizationId===scope) && (!query || `${event.title} ${event.organizationName} ${event.location} ${event.date}`.toLowerCase().includes(query)))
 $('#event-count').textContent=`${events.length} events · showing ${Math.min(eventLimit,events.length)}`
 const list=$('#event-results');list.replaceChildren()
 for(const event of events.slice(0,eventLimit)){
  const li=document.createElement('li'),a=document.createElement('a');a.href=event.sourceUrl;a.textContent=event.title;a.target='_blank';a.rel='noopener noreferrer';li.append(a,document.createTextNode(` · ${event.date || 'Date not supplied'} · ${event.organizationName || 'Organization not supplied'}${event.location?' · '+event.location:''}`));list.append(li)
 }
 $('#event-more').hidden=events.length<=eventLimit
}
function search() {
 const q = $('#network-search').value.trim().toLowerCase()
 const result = $('#network-results'); result.replaceChildren()
 const matches = data.organizations.filter(o=>!q || `${o.name} ${o.type}`.toLowerCase().includes(q))
 for (const org of matches.slice(0,q ? 20 : 5)) { const b=document.createElement('button'); b.type='button'; b.textContent=org.name; b.addEventListener('click',()=>select(org.id)); result.append(b) }
 if (!matches.length) result.textContent='No matching organization.'
}
function clearGraph() {
 labels.replaceChildren(); labelItems=[]; meshes=[]
 if (group) { group.traverse(o=>{o.geometry?.dispose(); if (Array.isArray(o.material)) o.material.forEach(m=>m.dispose()); else o.material?.dispose()}); scene.remove(group) }
 group = new THREE.Group(); scene.add(group)
}
function rebuild() {
 if (!data) return
 const cats=selectedCategories(), rels=selectedRelationships(), context=$('#include-context').checked
 let visible=data.organizations.filter(n=>cats.has(n.category))
 let visibleIds=new Set(visible.map(n=>n.id))
 const moneyOnly=$('#network-view').value==='money'
 edges=graphRelationships(data,{moneyOnly,includeCapitalization:context}).filter(e=>visibleIds.has(e.source) && visibleIds.has(e.target) && (moneyOnly || rels.has(e.relationship)))
 if(moneyOnly){const connected=new Set(edges.flatMap(e=>[e.source,e.target]));visible=visible.filter(n=>connected.has(n.id));visibleIds=new Set(visible.map(n=>n.id))}
 if ($('#neighbors').checked && selected) {
  const neighbors=new Set([selected]); edges.forEach(e=>{if(e.source===selected)neighbors.add(e.target);if(e.target===selected)neighbors.add(e.source)})
  visible=visible.filter(n=>neighbors.has(n.id)); visibleIds=new Set(visible.map(n=>n.id)); edges=edges.filter(e=>visibleIds.has(e.source)&&visibleIds.has(e.target))
 }
 const amounts=financialNodeAmounts(data,{includeCapitalization:context})
 nodes=visible.map(n=>({...n,financialAmount:amounts.get(n.id) ?? null})); edges=edges.map(e=>({...e}))
 status.textContent=`${nodes.length} organizations · ${edges.length} links${webgl ? '' : ' · SVG fallback'}`
 if(webgl) clearGraph()
 else { labels.replaceChildren(); labelItems=[]; svg.replaceChildren() }
 const classKeys=Object.keys(colors), clusters=classKeys.length, spread=230
 const center=n=>{const i=classKeys.indexOf(n.category),a=i/clusters*Math.PI*2;return {x:Math.cos(a)*spread,y:Math.sin(a)*spread}}
 layoutNetwork(nodes,edges,radius,center)
 if(!webgl) { renderSvg(); fit(); requestRender(); return }
 for(const n of nodes) {
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius(n),16,12),new THREE.MeshBasicMaterial({color:n.id===selected?0xe56d3c:colors[n.category]}))
  mesh.position.set(n.x,n.y,0);mesh.userData.node=n;group.add(mesh);meshes.push(mesh)
  const button=document.createElement('button');button.type='button';button.textContent=n.name;button.title=`${n.name} · ${financialLabel(n)}`;button.setAttribute('aria-pressed',String(n.id===selected));button.addEventListener('click',()=>select(n.id));labels.append(button);labelItems.push({button,n})
 }
 const parallel=new Map()
 for(const edge of edges) {
  const a=new THREE.Vector3(edge.source.x,edge.source.y,0),b=new THREE.Vector3(edge.target.x,edge.target.y,0)
  const pair=`${edge.source.id}-${edge.target.id}`,idx=parallel.get(pair)||0;parallel.set(pair,idx+1)
  const dir=b.clone().sub(a).normalize(),normal=new THREE.Vector3(-dir.y,dir.x,0)
  const start=a.clone().addScaledVector(dir,radius(edge.source)+2),end=b.clone().addScaledVector(dir,-radius(edge.target)-3)
  const midpoint=start.clone().add(end).multiplyScalar(.5).addScaledVector(normal,15+idx*18)
  const curve=new THREE.QuadraticBezierCurve3(start,midpoint,end),points=curve.getPoints(36),color=relationshipColor(edge)
  if(edge.relationship==='funding') {
   const width=edge.kind==='transfer' && edge.amount ? .55+Math.max(0,Math.log10(edge.amount)-4)*.35 : .8
   group.add(new THREE.Mesh(new THREE.TubeGeometry(curve,36,width,4,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.5})))
  } else {
   const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color,dashSize:edge.relationship==='affiliation'?8:3,gapSize:5,transparent:true,opacity:.65}));line.computeLineDistances();group.add(line)
  }
  const tangent=curve.getTangent(1).normalize(),arrow=new THREE.ArrowHelper(tangent,end.clone().addScaledVector(tangent,-8),8,color,7,4);group.add(arrow)
 }
 fit(); requestRender()
}
function fit() {
 if(!webgl) {
  const xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y),aspect=host.clientWidth/host.clientHeight
  const width=nodes.length?Math.max(...xs)-Math.min(...xs)+120:400,height=nodes.length?Math.max(...ys)-Math.min(...ys)+120:400
  const h=Math.max(height,width/aspect),w=h*aspect,cx=nodes.length?(Math.max(...xs)+Math.min(...xs))/2:0,cy=nodes.length?(Math.max(...ys)+Math.min(...ys))/2:0
  svgView={x:cx-w/2,y:cy-h/2,w,h}; requestRender(); return
 }
 const box=new THREE.Box3().setFromObject(group),center=new THREE.Vector3(),size=new THREE.Vector3()
 if(nodes.length) {box.getCenter(center);box.getSize(size)}
 const aspect=host.clientWidth/host.clientHeight
 const view=Math.max(size.y+100,(size.x+100)/aspect,200)
 camera.left=-view*aspect/2;camera.right=view*aspect/2;camera.top=view/2;camera.bottom=-view/2;camera.zoom=1
 camera.position.set(center.x,center.y,1000);controls.target.copy(center);camera.updateProjectionMatrix();controls.update();requestRender()
}
function render() {
 frame=0; if(webgl) renderer.render(scene,camera)
 else svg?.setAttribute('viewBox',`${svgView.x} ${svgView.y} ${svgView.w} ${svgView.h}`)
 const positions=[]
 const priority=[...labelItems].sort((a,b)=>(b.n.id===selected)-(a.n.id===selected)||(b.n.financialAmount??0)-(a.n.financialAmount??0))
 for(const item of priority) {
  const p=webgl?new THREE.Vector3(item.n.x,item.n.y,0).project(camera):new THREE.Vector3((item.n.x-svgView.x)/svgView.w*2-1,1-(item.n.y-svgView.y)/svgView.h*2,0),x=(p.x*.5+.5)*host.clientWidth,y=(-p.y*.5+.5)*host.clientHeight
  const width=Math.min(155,item.n.name.length*5.5+10)
  const overlapping=positions.some(r=>Math.abs(x-r.x)<(width+r.width)/2+8&&Math.abs(y-r.y)<28)
  item.button.hidden=p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1||(overlapping&&item.n.id!==selected)
  if(!item.button.hidden){item.button.style.left=`${x}px`;item.button.style.top=`${y}px`;positions.push({x,y,width})}
 }
}
function requestRender(){if(!disposed&&!frame)frame=requestAnimationFrame(render)}
function svgElement(tag,attrs={}) {
 const el=document.createElementNS('http://www.w3.org/2000/svg',tag)
 for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value))
 return el
}
function zoomSvg(factor) {
 const nextWidth=svgView.w/factor
 if(nextWidth<80||nextWidth>4000)return
 const cx=svgView.x+svgView.w/2,cy=svgView.y+svgView.h/2
 svgView.w/=factor;svgView.h/=factor;svgView.x=cx-svgView.w/2;svgView.y=cy-svgView.h/2;requestRender()
}
function initSvg() {
 svg=svgElement('svg',{'aria-label':'D3 organization network (SVG fallback)',role:'img'})
 svg.style.cssText='width:100%;height:100%;display:block;touch-action:none;cursor:grab'
 host.prepend(svg)
 let drag=null
 svg.addEventListener('pointerdown',event=>{if(event.target.tagName==='circle')return;drag={x:event.clientX,y:event.clientY,vx:svgView.x,vy:svgView.y};svg.setPointerCapture(event.pointerId)})
 svg.addEventListener('pointermove',event=>{if(!drag)return;svgView.x=drag.vx-(event.clientX-drag.x)/host.clientWidth*svgView.w;svgView.y=drag.vy-(event.clientY-drag.y)/host.clientHeight*svgView.h;requestRender()})
 svg.addEventListener('pointerup',()=>{drag=null});svg.addEventListener('pointercancel',()=>{drag=null})
 svg.addEventListener('wheel',event=>{event.preventDefault();zoomSvg(event.deltaY<0?1.1:1/1.1)},{passive:false})
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
  const width=edge.kind==='transfer'&&edge.amount?1+Math.max(0,Math.log10(edge.amount)-4)*.7:1.4
  const line=svgElement('path',{d:`M${sx},${sy} Q${(sx+tx)/2-uy*(15+idx*18)},${(sy+ty)/2+ux*(15+idx*18)} ${tx},${ty}`,fill:'none',stroke:`#${relationshipColor(edge).toString(16).padStart(6,'0')}`,'stroke-width':width,'stroke-opacity':.6,'marker-end':'url(#eco-arrow)'})
  if(edge.relationship!=='funding')line.setAttribute('stroke-dasharray',edge.relationship==='affiliation'?'8 5':'3 5')
  const title=svgElement('title');title.textContent=`${edge.sourceLabel} → ${edge.targetLabel}: ${edge.type} ${edge.amountLabel||''}`;line.append(title);svg.append(line)
 }
 for(const n of nodes) {
  const circle=svgElement('circle',{cx:n.x,cy:n.y,r:radius(n),fill:`#${(n.id===selected?0xe56d3c:colors[n.category]).toString(16).padStart(6,'0')}`})
  const title=svgElement('title');title.textContent=`${n.name} · ${financialLabel(n)}`;circle.append(title);circle.addEventListener('click',()=>select(n.id));svg.append(circle)
  const button=document.createElement('button');button.type='button';button.textContent=n.name;button.title=`${n.name} · ${financialLabel(n)}`;button.setAttribute('aria-pressed',String(n.id===selected));button.addEventListener('click',()=>select(n.id));labels.append(button);labelItems.push({button,n})
 }
}
function initWebgl() {
 try {
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(host.clientWidth,host.clientHeight);host.prepend(renderer.domElement)
  scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-500,500,400,-400,1,5000);camera.position.z=1000
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};controls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_PAN};controls.minZoom=.35;controls.maxZoom=6;controls.maxPolarAngle=Math.PI*.8;controls.addEventListener('change',requestRender)
  webgl=true
  resizeObserver=new ResizeObserver(()=>{renderer.setSize(host.clientWidth,host.clientHeight);fit()}); resizeObserver.observe(host)
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2()
  const hit=event=>{const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);return ray.intersectObjects(meshes)[0]?.object.userData.node}
  let down=null
  renderer.domElement.addEventListener('pointerdown',ev=>{down={x:ev.clientX,y:ev.clientY}})
  renderer.domElement.addEventListener('pointerup',ev=>{if(down&&Math.hypot(ev.clientX-down.x,ev.clientY-down.y)<6){const n=hit(ev);if(n)select(n.id)}down=null})
  renderer.domElement.addEventListener('pointermove',ev=>{const n=hit(ev),tip=$('#network-tooltip');tip.hidden=!n;if(n)tip.textContent=`${n.name} · ${financialLabel(n)}`;renderer.domElement.style.cursor=n?'pointer':'grab'})
  renderer.domElement.addEventListener('pointerleave',()=>{$('#network-tooltip').hidden=true})
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();webgl=false;labels.replaceChildren();status.textContent='Graphics unavailable. Use search, details and the relationship table below.'})
 } catch { webgl=false; initSvg() }
}
async function start(){
 try {
  const response=await fetch(dataUrl, {signal:abort.signal});if(!response.ok)throw new Error('Data unavailable');data=await response.json()
  const historyResponse=await fetch(historyUrl, {signal:abort.signal});if(!historyResponse.ok)throw new Error('Event history unavailable');const historyData=await historyResponse.json();data=mergeNetworkHistory(data,historyData); if(disposed)return; $('#network-table .eco-table-scroll').outerHTML=relationshipTable(data); rewriteLinks()
  $('#event-search').addEventListener('input',()=>{eventLimit=100;renderEvents()});$('#event-org-only').addEventListener('change',()=>{eventLimit=100;renderEvents()});$('#event-more').addEventListener('click',()=>{eventLimit+=100;renderEvents()});renderEvents()
  initWebgl();search()
  $('#network-search').addEventListener('input',search)
  root.querySelectorAll('[name=node-category],[name=relationship],#include-context,#neighbors,#network-view').forEach(el=>el.addEventListener('change',()=>{applyTable();rebuild()}))
  $('#table-scope').addEventListener('change',applyTable)
  $('#network-fit').addEventListener('click',fit)
  for(const [id,factor] of [['#zoom-in',1.25],['#zoom-out',.8]]) $(id).addEventListener('click',()=>{if(!webgl){zoomSvg(factor);return}camera.zoom=Math.max(.35,Math.min(6,camera.zoom*factor));camera.updateProjectionMatrix();requestRender()})
  $('#network-reset').addEventListener('click',()=>{selected=null;root.querySelectorAll('[name=node-category],[name=relationship]').forEach(c=>c.checked=true);$('#network-view').value='all';$('#include-context').checked=false;$('#neighbors').checked=false;$('#neighbors').disabled=true;$('#network-search').value='';$('#table-scope').value='';$('#network-detail').innerHTML='<h2>Select an organization</h2><p>Search or select a graph label to explore its evidence.</p>';history.replaceState(history.state,'',location.pathname);renderEvents();search();applyTable();rebuild()})
  const initial=new URL(location.href).searchParams.get('org');if(initial&&data.organizations.some(n=>n.id===initial)){select(initial)}else rebuild()
  loadPortalEvidence(data, (url, options) => fetch(url,{...options,signal:abort.signal}),apiPrefix).then(updated=>{if(disposed)return;data=mergeNetworkHistory(updated,historyData);renderEvents();$('#network-table .eco-table-scroll').outerHTML=relationshipTable(data);search();applyTable();if(selected)select(selected);else rebuild();$('#network-source').textContent='Public relationship evidence updated '+new Date(data.portalUpdatedAt).toLocaleString()+'. Awards and commitments do not establish payment; amounts may overlap.'}).catch(()=>{if(disposed)return;$('#network-source').textContent='Showing saved public evidence. Live refresh is temporarily unavailable.'})
 }catch(error){if(disposed)return;status.textContent='Network data is unavailable. Reload to try again or browse the organization directory.';host.hidden=true;console.error(error)}
}
rewriteLinks(); start();
return () => { disposed=true; abort.abort(); resizeObserver?.disconnect(); cancelAnimationFrame(frame); controls?.dispose();
 group?.traverse(o=>{o.geometry?.dispose(); if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose()}); renderer?.dispose(); root.replaceChildren(); };
}
