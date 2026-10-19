import {bundleRenderedEdges,layoutConnections} from './network-edge-bundles.js'
import {appendNetworkInspection,applyNetworkFinancialSummary} from './network-inspection.js'
import {analyticalLayout} from './network-layouts.js'
import {createNetworkAnalysis,disclosure,metricRadius,financialEvidence,endpoint} from './network-analysis.js'
import {mountVisibilityControls} from './network-visibility.js'
import {MAX_NETWORK_DIMENSIONS} from './nd-controls.js'
import {createFrameBudget,createFrameRate} from './frame-budget.js'
import {createLabelGrid} from './label-layout.js'
import {mountNetworkLawDialogs} from './network-law-dialogs.js'
import {rotateND} from './particle-life-4d.js'
import {shortGroupName} from '../../domain/organization/groupNames'
import {persistNetworkSettings} from './network-settings.js'
import { transactionVisibility, transactionCounts } from './zoom-visibility.js'
import { quantityEdgeWidths } from './edge-quantity.js'
import { relationshipColor } from './relationship-colors.js'
import {mergeNetworkHistory,appendNonprofitEvidence} from './network-history.js'
import { applyFundHierarchy, foldFundNodes, financialNodePies, pieLabel } from './fund-pies.js'
import { createNetworkGPU, curvePoints } from './webgpu-renderer.js'
import { assignEdgeCurvature } from './ecosystem-physics.js'
import { uniqueNetworkLinks } from './network-links.js'
import { createNetworkLayout } from './network-layout.js'
import { prepareNetworkData, loadSharedNetworkData } from './network-data.js'
import { organizationPreview, edgeDetails, networkPreviewSummaries } from './ecosystem-view.js'
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
const fpsOutput=document.createElement('output');fpsOutput.className='eco-network-fps';fpsOutput.setAttribute('aria-label','Graph frame rate');fpsOutput.textContent='FPS —';host.append(fpsOutput)
const frameBudget=createFrameBudget(),frameRate=createFrameRate()
let previousFrame=0,labelCursor=0,labelsRemaining=0,paintInterval=0,lastPaint=0
const fpsTimer=setInterval(()=>{const fps=frameRate.value(performance.now());fpsOutput.textContent=fps===null?'FPS — (idle)':`${fps.toFixed(1)} FPS · ${frameBudget.count(nodes.length)}/${nodes.length} nodes/frame`},500)
let fittedWidth=1, recordedCounts=new Map()
let preparedData, previewSummaries, data, selected = null, renderer, canvas, nodes=[], edges=[], labelItems=[], frame=0
let inspectorKey=null, simulation, fitted=false, geometryDirty=true, visibilityKey=null, visible=new Set(), visibleEdges=new Set(), labelPriority=[]
const savedPositions=new Map()
let defaultPositions={}
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)')
$('#live-physics').checked=!reducedMotion.matches
$('#network-share-status').insertAdjacentHTML('afterend','<label class="eco-slider-row"><span class="eco-slider-name">Minimum FPS</span><input id="minimum-fps" type="range" min="1" max="120" step="1" value="10"><span class="eco-slider-value"><output id="minimum-fps-value">10</output> FPS</span></label>')
const minimumFPS=()=>Number($('#minimum-fps').value)
$('#minimum-fps').addEventListener('input',()=>{$('#minimum-fps-value').textContent=$('#minimum-fps').value;frameBudget.reset();requestRender()},{signal:abort.signal})
rewriteLinks()
const visibilityControls=mountVisibilityControls(root)
let analysis=null,disclosed=null,hovered=null,renderedGraphNodes=[],renderedGraphEdges=[],recordEdges=[]
const expandedCommunities=new Set(),networkCoordinates=new Map()
let analysisLayout=null
function updateAnalysisLayout(){
 if(!analysis)return
 const mode=$('#network-analysis-mode').value
 for(const option of $('#network-grouping').options)option.disabled=mode==='geography'&&['community','sector'].includes(option.value)
 if(mode==='geography'&&!['county','municipality'].includes($('#network-grouping').value)){$('#network-grouping').value='county';expandedCommunities.clear();$('#network-expanded-communities').value='[]';updateCommunityList()}
 $('#network-flow-filters').hidden=mode!=='funding'
 if(mode==='network'){if(analysisLayout)for(const n of nodes)Object.assign(n,networkCoordinates.get(n.id));analysisLayout=null;simulation?.motion(physicsEnabled())}
 else{if(!analysisLayout){networkCoordinates.clear();for(const n of nodes)networkCoordinates.set(n.id,{x:n.x,y:n.y,z:n.z})}simulation?.motion(false);analysisLayout=analyticalLayout(nodes,recordEdges,mode,{kind:$('#network-flow-kind').value,category:$('#network-flow-category').value,from:$('#network-flow-from').value,to:$('#network-flow-to').value,grouping:$('#network-grouping').value,expanded:expandedCommunities});for(const n of nodes){const point=analysisLayout.positions.get(n.id);if(point)Object.assign(n,point)}}
 $('#network-analysis-legend').textContent=mode==='funding'?`Funder → intermediary → recipient. ${analysisLayout.edgeIds.size} documented directional relationships; ${analysisLayout.missing} organizations have no matching flow. Unknown amounts remain unweighted; awards do not establish payment.`:mode==='geography'?`Published Maryland coordinates only. ${analysisLayout.locatedCount} located in ${analysisLayout.positions.size} markers; ${analysisLayout.missing} missing or outside Maryland. County/city markers are centroids of published member coordinates; expand to see organizations.`:'Node colors identify sectors or communities. Orange marks selected relationships. Dashed lines identify non-funding associations.'
 visibilityKey=null;geometryDirty=true;requestRender()
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>applyTheme(),{signal:abort.signal})
function applyTheme(){const mode=$('#network-theme').value;root.dataset.networkTheme=mode==='auto'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode}
function saveExpanded(){const control=$('#network-expanded-communities');control.value=JSON.stringify([...expandedCommunities]);control.dispatchEvent(new Event('input',{bubbles:true}))}
function restoreExpanded(){try{const values=JSON.parse($('#network-expanded-communities').value);if(Array.isArray(values)&&values.length<=analysis.byId.size){const groups=analysis.communities($('#network-grouping').value).clusters;expandedCommunities.clear();for(const id of values)if(typeof id==='string'&&groups.has(id))expandedCommunities.add(id)}}catch{/* Ignore invalid stored expansion IDs. */}}
function updateDisclosure(){
 if(!analysis)return
 disclosed=disclosure(analysis,edges,{mode:$('#network-detail-mode').value==='overview'&&!$('#network-clustering').checked?'all':$('#network-detail-mode').value,selected,depth:Number($('#network-hop-depth').value),grouping:$('#network-grouping').value,expanded:expandedCommunities})
 visibilityKey=null;geometryDirty=true;labelPriority=[];requestRender()
}
function updateNodeSizes(){
 if(!analysis)return
 const metric=$('#network-size-metric').value,values=nodes.map(n=>metric==='connections'?analysis.adjacency.get(n.id).size:metric==='uniform'?0:analysis[metric].get(n.id)||0),max=Math.max(1,...values)
 nodes.forEach((n,i)=>n.renderRadius=metricRadius(values[i],max));geometryDirty=true;requestRender()
}
function updateCommunityList(){
 const list=$('#network-community-list');list.replaceChildren();if(!analysis)return
 const groups=analysis.communities($('#network-grouping').value).clusters
 for(const group of [...groups.values()].sort((a,b)=>b.members.length-a.members.length)){
  if(group.members.length<2)continue
  const button=document.createElement('button');button.type='button';button.setAttribute('aria-expanded',String(expandedCommunities.has(group.id)))
  const name=$('#network-grouping').value==='community'?analysis.byId.get(group.members[0]).name:group.id
  button.textContent=`${name}: ${group.members.length} organizations · ${group.internal} internal / ${group.external} external relationships`
  button.addEventListener('click',()=>{if(expandedCommunities.has(group.id))expandedCommunities.delete(group.id);else expandedCommunities.add(group.id);button.setAttribute('aria-expanded',String(expandedCommunities.has(group.id)));saveExpanded();updateDisclosure()},{signal:abort.signal});list.append(button)
 }
}
for(const id of ['scale-node-finances','node-size-algorithm','node-size-alpha']){const control=$('#'+id);if(control){control.disabled=true;control.closest('label').hidden=true}}
const settingsReady=persistNetworkSettings(root,abort.signal,four?'4d':spatial?'3d':'2d')
$('#camera-speed').addEventListener('input',()=>{$('#camera-speed-value').textContent=Number($('#camera-speed').value).toFixed(1)},{signal:abort.signal})
const recordPaint=()=>{const now=performance.now();paintInterval=lastPaint&&now-lastPaint<1000?now-lastPaint:0;lastPaint=now;frameRate.frame(now)}
const physicsEnabled=()=>!analysisLayout&&!document.hidden&&!reducedMotion.matches&&$('#live-physics').checked
const dimensionCount=()=>four?Math.max(4,Math.min(MAX_NETWORK_DIMENSIONS,Math.round(Number($('#network-dimensions').value)||4))):spatial?3:2
const projectionAngles=()=>Array.from({length:(dimensionCount()-3)*3},(_,i)=>Number($('#projection-'+(3+Math.floor(i/3))+'-'+(i%3)).value))
let fourthPosition=Array(MAX_NETWORK_DIMENSIONS).fill(0),projectionNeedsFit=false
function updateProjectionControls(){
 if(!four)return
 const dimensions=dimensionCount(),select=$('#projection-axis')
 for(const option of select.options)option.hidden=Number(option.value)>=dimensions
 if(Number(select.value)>=dimensions)select.value='3'
 for(const group of root.querySelectorAll('[data-projection-option]'))group.hidden=group.dataset.projectionOption!==$('#projection-algorithm').value
 for(const group of root.querySelectorAll('[data-projection-axis]'))group.hidden=group.dataset.projectionAxis!==select.value
 $('#life-w-position').textContent=(simulation?.axisPosition(fourthPosition,Number(select.value))??rotateND(fourthPosition.slice(0,dimensions),projectionAngles())[Number(select.value)]).toFixed(2)
}
function moveFourth(delta){
 const world=simulation?.movement(delta,Number($('#projection-axis').value));if(!world)return
 world.forEach((v,i)=>fourthPosition[i]+=v);applyProjection()
}
function applyProjection(refit=false,fitView=false){if(four){
 projectionNeedsFit ||= fitView
 simulation?.projection(projectionAngles(),Number($('#life-perspective').value),fourthPosition,{
  algorithm:$('#projection-algorithm').value,displayDimensions:Number($('#display-dimensions').value),seed:Number($('#projection-seed').value),sliceAxis:Number($('#projection-axis').value),sliceWidth:Number($('#projection-slice-width').value),refit,
 });updateProjectionControls()
}}
function motionChange(){simulation?.motion(physicsEnabled());requestRender()}
document.addEventListener('visibilitychange',motionChange,{signal:abort.signal})
reducedMotion.addEventListener('change',motionChange,{signal:abort.signal})
let gpuReady = false, view = { x: -400, y: -400, w: 800, h: 800 }
const radius = n => n.renderRadius
let cameraTransition=0
function focusView(node){
 if(spatial){renderer.focus?.(node,reducedMotion.matches);return}
 cancelAnimationFrame(cameraTransition);const x=view.x,y=view.y,endX=node.x-view.w/2,endY=node.y-view.h/2,start=performance.now()
 const tick=now=>{if(disposed)return;const t=reducedMotion.matches?1:Math.min(1,(now-start)/350),ease=t*t*(3-2*t);view.x=x+(endX-x)*ease;view.y=y+(endY-y)*ease;requestRender();if(t<1)cameraTransition=requestAnimationFrame(tick)};tick(start)
}
abort.signal.addEventListener('abort',()=>cancelAnimationFrame(cameraTransition),{once:true})
const forceOptions=()=>({live:true,attractionLaw:$('#attraction-law').value,repulsionLaw:$('#repulsion-law').value,attractionAlpha:Number($('#attraction-alpha').value),repulsionAlpha:Number($('#repulsion-alpha').value),dimensions:dimensionCount(),lifeRadius:Number($('#life-radius')?.value??300),lifeFriction:Number($('#life-friction')?.value??.85),attraction:Number($('#attraction').value),repulsion:Number($('#repulsion').value),proximity:Number($('#proximity').value),centralGravity:Number($('#central-gravity').value),dither:Number($('#dither').value)})
const financialLabel = n => n.financialAmount ? `Recorded USD transaction volume: ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n.financialAmount)}; incoming + outgoing; payment unverified${n.financialPie ? '. '+pieLabel(n.financialPie) : ''}` : 'USD volume undisclosed'
function previewNode(org) {
 hovered=org.id;labelPriority=[];requestRender()
 if(selected)return
 const geographic=analysisLayout?.geographicGroups?.get(org.id),group=disclosed?.clusters.get(disclosed.membership.get(org.id)),aggregate=geographic||(!analysisLayout&&$('#network-detail-mode').value==='overview'&&$('#network-clustering').checked&&!expandedCommunities.has(group?.id)&&group?.members.length>1?group:null)
 if(aggregate){const panel=$('#network-detail'),heading=document.createElement('h2'),note=document.createElement('p');heading.textContent=`${geographic?.label||'Community'} · ${aggregate.members.length} organizations`;note.textContent=`Click to expand. Organization anchor: ${org.name}. This marker is an aggregate, not an organization balance.`;panel.replaceChildren(heading,note);return}
 const key='node:'+org.id;if(inspectorKey===key)return;inspectorKey=key
 $('#network-detail').innerHTML=organizationPreview(org,previewSummaries);if(analysis)applyNetworkFinancialSummary($('#network-detail'),org,analysis);rewriteLinks();if(matchMedia('(max-width:900px)').matches&&!root.classList.contains('eco-controls-open')&&!root.classList.contains('eco-visualization-open')&&!root.classList.contains('eco-search-open')){root.classList.add('eco-inspector-open');root.classList.remove('eco-controls-open');panelState()}
}
function previewEdge(edge) {
 if(selected)return
 const key='edge:'+edge.id;if(inspectorKey===key)return;inspectorKey=key
 $('#network-detail').innerHTML=edgeDetails(edge,data);if(edge.records?.length>1){const count=document.createElement('p');count.textContent=`${edge.records.length} records share this geometry; select either organization to inspect every record and source.`;$('#network-detail').prepend(count)}rewriteLinks();if(matchMedia('(max-width:900px)').matches&&!root.classList.contains('eco-controls-open')&&!root.classList.contains('eco-visualization-open')&&!root.classList.contains('eco-search-open')){root.classList.add('eco-inspector-open');root.classList.remove('eco-controls-open');panelState()}
}
function bindNodePreview(button,node) {
 button.addEventListener('pointerenter',()=>previewNode(node))
 button.addEventListener('focus',()=>previewNode(node))
}
function activateNode(id){const geographic=analysisLayout?.geographicGroups?.get(id);if(geographic){expandedCommunities.add(geographic.id);saveExpanded();updateCommunityList();updateAnalysisLayout();return}const group=disclosed?.membership.get(id);if(!analysisLayout&&$('#network-detail-mode').value==='overview'&&$('#network-clustering').checked&&!expandedCommunities.has(group)&&disclosed.clusters.get(group)?.members.length>1){expandedCommunities.add(group);saveExpanded();updateCommunityList();updateDisclosure()}else select(id)}
function select(id) {
 let org = data.organizations.find(o=>o.id===id); if (!org) return
 if(org.administratorId){id=org.administratorId;org=data.organizations.find(o=>o.id===id);if(!org)return}
 previewSummaries=preparedData?.data===data?preparedData.summaries:networkPreviewSummaries(data)
 if($('#network-analysis-mode').value==='geography'){const group=$('#network-grouping').value==='county'?org.county:org.municipality||org.city;if(group){expandedCommunities.add(group);saveExpanded();updateAnalysisLayout()}}
 selected = id;$('#network-detail-mode').value='focus';$('#network-detail-mode').dispatchEvent(new Event('input',{bubbles:true})); inspectorKey='node:'+id; $('#neighbors').disabled=false
 $('#network-detail').innerHTML = organizationPreview(org,previewSummaries);if(analysis)appendNetworkInspection($('#network-detail'),org,analysis,recordEdges,unpin); rewriteLinks();if(matchMedia('(max-width:900px)').matches&&!root.classList.contains('eco-controls-open')&&!root.classList.contains('eco-visualization-open')&&!root.classList.contains('eco-search-open')){root.classList.add('eco-inspector-open');root.classList.remove('eco-controls-open');panelState()}
 selectPanel('inspector')
 const u = new URL(location.href); u.searchParams.set('org',id); history.replaceState(history.state,'',u)
 refreshSelection()
 const point=nodes.find(n=>n.id===id);if(point)focusView(point)
}
function refreshSelection(){
 for(const {button,n} of labelItems)button.setAttribute('aria-pressed',String(n.id===selected))
 updateDisclosure()
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
 $('#network-results-heading').textContent=q?'Search results':'Suggested organizations'
 const matches = data.organizations.filter(o=>!q || `${o.name} ${shortGroupName(o.name)} ${o.type}`.toLowerCase().includes(q))
 for (const org of matches.slice(0,q ? 20 : 5)) { const b=document.createElement('button'); b.type='button'; b.textContent=shortGroupName(org.name);b.setAttribute('aria-label',org.name); b.addEventListener('click',()=>{select(org.id);selectPanel('inspector')}); result.append(b) }
 if (!matches.length) result.textContent='No matching organization.'
}
function rebuild() {
 if (!data || !gpuReady) return
 inspectorKey=null
 previewSummaries=preparedData?.data===data?preparedData.summaries:networkPreviewSummaries(data)
 simulation?.stop()
 nodes.forEach(n=>savedPositions.set(n.id,{q:n.q,velocityND:n.velocityND,x:n.x,y:n.y,z:n.z,vx:n.vx,vy:n.vy,vz:n.vz}))
 visibilityKey=null;geometryDirty=true;labelPriority=[]
 const cats=selectedCategories(), rels=selectedRelationships(), context=$('#include-context').checked
 const graphData=preparedData?.data===data?preparedData.folded:foldFundNodes(data)
 const pies=preparedData?.data===data?(context?preparedData.contextPies:preparedData.summaries.pies):financialNodePies(data,{includeCapitalization:context})
 let visible=graphData.organizations.filter(n=>cats.has(n.category))
 let visibleIds=new Set(visible.map(n=>n.id))
 const moneyOnly=$('#network-view').value==='money'
 edges=uniqueNetworkLinks(graphRelationships(graphData,{moneyOnly,includeCapitalization:context}).filter(e=>visibleIds.has(e.source) && visibleIds.has(e.target) && (moneyOnly || rels.has(e.relationship))))
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
 nodes=visible.map(n=>({...n,...(savedPositions.get(n.id)||defaultPositions[n.id]?.[four?'4d':spatial?'3d':'2d']),financialAmount:amounts.get(n.id) ?? null,financialPie:pies.get(n.id) || null})); edges=edges.map(e=>({...e,quantityWidth:widths.get(e.id) ?? 1.4}))
 const scaleFinances=$('#scale-node-finances').checked
 const sizing={algorithm:$('#node-size-algorithm').value,alpha:Number($('#node-size-alpha').value),maxAmount:Math.max(0,...amounts.values())}
 nodes.forEach(n=>{n.renderRadius=financialNodeRadius(scaleFinances?n.financialAmount:null,sizing)})
 const recordIds=new Set(nodes.map(n=>n.id));recordEdges=graphRelationships(graphData,{moneyOnly,includeCapitalization:context}).filter(e=>recordIds.has(endpoint(e.source))&&recordIds.has(endpoint(e.target))&&(moneyOnly||rels.has(e.relationship)))
 analysis=createNetworkAnalysis(nodes,recordEdges);restoreExpanded();updateNodeSizes();updateDisclosure();updateCommunityList()
 const categorySelect=$('#network-flow-category');for(const category of new Set(nodes.map(n=>n.category)))if(![...categorySelect.options].some(o=>o.value===category)){const option=document.createElement('option');option.value=category;option.textContent=category;categorySelect.append(option)}
 status.textContent=`${nodes.length} organizations · ${edges.length} links`
 labels.replaceChildren();labelItems=[]
 simulation=createNetworkLayout(nodes,layoutConnections(edges),forceOptions(),physicsEnabled(),reprojected=>{geometryDirty ||= reprojected;requestRender()});applyProjection()
 const recordNodes=new Map(nodes.map(n=>[n.id,n]));recordEdges=recordEdges.map(e=>({...e,source:recordNodes.get(endpoint(e.source)),target:recordNodes.get(endpoint(e.target))}));assignEdgeCurvature(recordEdges)
 assignEdgeCurvature(edges);updateAnalysisLayout();applyTheme()
 for(const n of nodes){
  const button=document.createElement('button');button.hidden=true;button.type='button';button.textContent=shortGroupName(n.name)
  if(n.financialPie){button.dataset.fundingSlices=String(n.financialPie.slices.length);button.dataset.fundingTotal=String(n.financialPie.total)}
  button.setAttribute('aria-label',`${n.name} · ${financialLabel(n)}`);button.setAttribute('aria-pressed',String(n.id===selected));button.addEventListener('click',()=>activateNode(n.id));bindNodePreview(button,n);labels.append(button);labelItems.push({button,n,width:Math.min(155,button.textContent.length*5.5+10)})
 }
 if(selected&&analysis.byId.has(selected)){const org=analysis.byId.get(selected);$('#network-detail').innerHTML=organizationPreview(org,previewSummaries);appendNetworkInspection($('#network-detail'),org,analysis,recordEdges,unpin);rewriteLinks()}
 if(!fitted){fit();fitted=true;if(selected){const point=nodes.find(n=>n.id===selected);if(point)focusView(point)}}requestRender()
}
function fit(){
 if(spatial){renderer.fit(analysisLayout?nodes.filter(n=>analysisLayout.positions.has(n.id)):nodes);requestRender();return}
 const fitting=analysisLayout?nodes.filter(n=>analysisLayout.positions.has(n.id)):nodes
 const aspect=host.clientWidth/Math.max(1,host.clientHeight),xs=fitting.map(n=>n.x),ys=fitting.map(n=>n.y)
 const minX=xs.length?Math.min(...xs):0,maxX=xs.length?Math.max(...xs):0,minY=ys.length?Math.min(...ys):0,maxY=ys.length?Math.max(...ys):0
 const padding=Math.max(120,(maxY-minY)*.12,(maxX-minX)*.12)
 const height=Math.max(maxY-minY+padding,(maxX-minX+padding)/aspect,200),width=height*aspect
 fittedWidth=width;view={x:(minX+maxX-width)/2,y:(minY+maxY-height)/2,w:width,h:height};requestRender()
}
function render(time=0) {
 frame=0;
 if(!gpuReady||document.hidden){previousFrame=0;frameBudget.reset();frameRate.reset();return}
 const started=performance.now(),interval=previousFrame?time-previousFrame:0
 previousFrame=time
 const updated=analysisLayout?new Set():simulation?.consume(physicsEnabled()?frameBudget.count(nodes.length):nodes.length)||new Set()
 if(four&&projectionNeedsFit&&!simulation.projectionPending()){projectionNeedsFit=false;renderer.fit(nodes)}

 const zoom=spatial?renderer.zoomLevel():fittedWidth/view.w
 const key=[zoom,selected,$('#show-links').checked,$('#zoom-sparse').checked,$('#visibility-factor').value,$('#network-detail-mode').value,$('#network-hop-depth').value,$('#network-grouping').value,$('#network-clustering').checked].join('|')
 const visibilityChanged=key!==visibilityKey||(four&&updated.size>0)
 if(visibilityChanged){
 visibilityKey=key
 visible=new Set(nodes.filter(n=>(!analysisLayout||analysisLayout.positions.has(n.id))&&!n.clipped4D&&(n.id===selected||!$('#zoom-sparse').checked||transactionVisibility(recordedCounts.get(n.id)||0,zoom,Number($('#visibility-factor').value)))).map(n=>n.id))
 if(!analysisLayout&&($('#network-detail-mode').value==='overview'&&$('#network-clustering').checked))visible=new Set([...visible].filter(id=>expandedCommunities.has(disclosed.membership.get(id))||disclosed.representatives.has(id)))
 const edgeVisible=e=>visible.has(analysisLayout?.nodeMapping?.get(endpoint(e.source))||endpoint(e.source))&&visible.has(analysisLayout?.nodeMapping?.get(endpoint(e.target))||endpoint(e.target))
 const drawingEdges=$('#network-detail-mode').value==='all'||$('#network-analysis-mode').value==='funding'?recordEdges:edges
 visibleEdges=new Set($('#show-links').checked?drawingEdges.filter(e=>((($('#network-detail-mode').value==='overview'&&$('#network-clustering').checked)&&!analysisLayout)||edgeVisible(e))&&(analysisLayout?analysisLayout.edgeIds.has(e.id):$('#network-detail-mode').value==='all'||!$('#network-clustering').checked||disclosed?.edgeIds.has(e.id))).map(e=>e.id):[])
 status.textContent=`${visible.size} visible / ${nodes.length} organizations · ${visibleEdges.size} visible links · ${disclosed?.clusters.size||0} groups${$('#network-detail-mode').value==='focus'&&!selected?' · Select an organization to explore':''}`
 }
 if(geometryDirty||visibilityChanged||updated.size){updatePositions(geometryDirty||visibilityChanged?null:updated);geometryDirty=false}
 const painted=renderer.render(view)
 if(painted!==false&&spatial)frameRate.frame(performance.now())
 // Read layout once before changing any label styles or visibility.
 const viewportWidth=host.clientWidth,viewportHeight=host.clientHeight,positions=createLabelGrid()
 if(!labelPriority.length)labelPriority=[...labelItems].sort((a,b)=>(b.n.id===selected)-(a.n.id===selected)||(b.n.id===hovered)-(a.n.id===hovered)||(analysis?.adjacency.get(b.n.id)?.size||0)-(analysis?.adjacency.get(a.n.id)?.size||0))
 const labelCount=!physicsEnabled()||spatial&&!four?labelPriority.length:frameBudget.count(labelPriority.length)
 const batch=new Set(Array.from({length:labelCount},(_,i)=>(labelCursor+i)%Math.max(1,labelPriority.length)))
 labelCursor=(labelCursor+labelCount)%Math.max(1,labelPriority.length)
 // Reuse unchanged label rectangles as collision obstacles between update turns.
 for(let i=0;i<labelPriority.length;i++){const item=labelPriority[i];if(!batch.has(i)&&!item.button.hidden&&item.labelX!==undefined)positions.add(item.labelX,item.labelY,item.width)}
 for(const i of batch) {const item=labelPriority[i];if(!item)continue
  const geographic=analysisLayout?.geographicGroups?.get(item.n.id),group=disclosed?.clusters.get(disclosed.membership.get(item.n.id)),collapsed=!analysisLayout&&($('#network-detail-mode').value==='overview'&&$('#network-clustering').checked)&&!expandedCommunities.has(group?.id)&&group?.members.length>1
  const text=geographic?`${geographic.label} · ${geographic.members.length} organizations`:shortGroupName(item.n.name)+(collapsed?` · ${group.members.length} organizations`:'');if(item.button.textContent!==text){item.button.textContent=text;item.width=Math.min(155,text.length*5.5+10)}
  const important=geographic||collapsed||item.n.id===selected||item.n.id===hovered,labelMode=$('#network-label-mode').value
  const eligible=important||(labelMode!=='hover'&&(labelMode==='all'||(analysis?.adjacency.get(item.n.id)?.size||0)>=Math.max(2,8/Math.max(.2,zoom))))
  if(!eligible||!visible.has(item.n.id)){if(!item.button.hidden)item.button.hidden=true;continue}
  const projected=spatial?renderer.project(item.n):null
  const p=projected?{x:projected.x/viewportWidth*2-1,y:1-projected.y/viewportHeight*2,z:projected.visible?0:2}:{x:(item.n.x-view.x)/view.w*2-1,y:1-(item.n.y-view.y)/view.h*2,z:0},x=(p.x*.5+.5)*viewportWidth,y=(-p.y*.5+.5)*viewportHeight
  // Cull before testing label collisions; hidden nodes need no DOM position writes.
  if(p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1){if(!item.button.hidden)item.button.hidden=true;continue}
  const width=item.width,hidden=item.n.id!==selected&&positions.overlaps(x,y,width)
  if(item.button.hidden!==hidden)item.button.hidden=hidden
  if(!hidden){
   if(item.labelX!==x){item.button.style.left=`${x}px`;item.labelX=x}
   if(item.labelY!==y){item.button.style.top=`${y}px`;item.labelY=y}
   positions.add(x,y,width)
  }
 }
 labelsRemaining=Math.max(0,labelsRemaining-labelCount)
 const frameMs=Math.max(performance.now()-started,interval&&interval<1000?interval:0,paintInterval)
 frameBudget.observe(frameMs,nodes.length,minimumFPS());renderer.adapt?.(frameMs,minimumFPS())
 if((!analysisLayout&&(physicsEnabled()||simulation?.pending()))||labelsRemaining>0)scheduleRender()
 else previousFrame=0
}
function scheduleRender(){if(!disposed&&!frame)frame=requestAnimationFrame(render)}
function requestRender(){labelsRemaining=labelItems.length;scheduleRender()}
function updatePositions(updated=null){
 if(!gpuReady)return
 const width=Number($('#link-width').value),opacity=Number($('#network-edge-opacity').value),encoding=$('#network-edge-encoding').value,color=$('#custom-link-color').checked?parseInt($('#link-color').value.slice(1),16):null
 const overview=!analysisLayout&&($('#network-detail-mode').value==='overview'&&$('#network-clustering').checked),nodeById=new Map(nodes.map(n=>[n.id,n])),representative=new Map()
 if(overview)for(const group of disclosed.clusters.values()){
  const rep=group.members.find(id=>disclosed.representatives.has(id));for(const id of group.members)representative.set(id,expandedCommunities.has(group.id)?id:rep)
 }
 renderedGraphNodes=nodes.filter(n=>visible.has(n.id)).map(n=>{const geographic=analysisLayout?.geographicGroups?.get(n.id),group=disclosed?.clusters.get(disclosed.membership.get(n.id)),collapsed=overview&&!expandedCommunities.has(group?.id)&&group?.members.length>1;return {...n,category:geographic||collapsed?'general':n.category,opacity:$('#network-detail-mode').value==='focus'&&selected&&!disclosed.focus.has(n.id)?.2:1,renderRadius:geographic?Math.min(14,5+Math.sqrt(geographic.members.length)):collapsed?Math.min(14,5+Math.sqrt(group.members.length)):n.renderRadius,financialPie:geographic||collapsed||($('#network-detail-mode').value==='focus'&&selected&&!disclosed.focus.has(n.id))?null:n.financialPie}})
 const renderById=new Map(renderedGraphNodes.map(n=>[n.id,n]))
 const drawingEdges=$('#network-detail-mode').value==='all'||$('#network-analysis-mode').value==='funding'?recordEdges:edges
 renderedGraphEdges=drawingEdges.filter(e=>visibleEdges.has(e.id)).map(edge=>{
  const evidence=financialEvidence(edge),focused=selected&&disclosed?.focus.has(endpoint(edge.source))&&disclosed?.focus.has(endpoint(edge.target)),a=endpoint(edge.source),b=endpoint(edge.target),source=renderById.get(analysisLayout?.nodeMapping?.get(a)||(overview?representative.get(a):a)),target=renderById.get(analysisLayout?.nodeMapping?.get(b)||(overview?representative.get(b):b))
  return {...edge,source:source||nodeById.get(a),target:target||nodeById.get(b),opacity:focused?.85:opacity,directional:!overview&&($('#network-funding-arrows').checked||$('#network-analysis-mode').value==='funding')&&evidence.directed,quantityWidth:(encoding==='amount'&&evidence.amount!==null?Math.min(6,1+Math.log10(1+evidence.amount)/2):1.4)*width}
 })
 const graphColors=$('#network-color-metric').value==='community'?Object.fromEntries([...disclosed.clusters.keys()].map((id,i)=>[id,[0x0072b2,0xe69f00,0x009e73,0xcc79a7,0x56b4e9,0xd55e00][i%6]])):colors
 if($('#network-color-metric').value==='community')renderedGraphNodes=renderedGraphNodes.map(n=>({...n,category:disclosed.membership.get(n.id)}))
 const edgeColor=edge=>selected&&disclosed?.focus.has(endpoint(edge.source))&&disclosed?.focus.has(endpoint(edge.target))?0xd55e00:color!==null?color:encoding==='type'?relationshipColor(edge):0x77878c
 if(drawingEdges===recordEdges){renderedGraphEdges=bundleRenderedEdges(renderedGraphEdges,edgeColor);assignEdgeCurvature(renderedGraphEdges);for(const edge of renderedGraphEdges)edge.curveOffset=Math.max(-60,Math.min(60,edge.curveOffset||0))}
 status.dataset.renderedBundles=String(renderedGraphEdges.length)
 renderer.update(renderedGraphNodes,renderedGraphEdges,new Set(renderedGraphNodes.map(n=>n.id)),new Set(renderedGraphEdges.map(e=>e.id)),selected,graphColors,edgeColor,overview?null:updated)
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
 canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%;display:block;touch-action:none;cursor:grab';canvas.setAttribute('aria-label',four?'N-dimensional organization relationship network':spatial?'3D WebGPU organization network':rendererKind==='canvas'?'Organization network':'Native WebGPU organization network');canvas.dataset.renderer=rendererKind;host.prepend(canvas)
 if(rendererKind==='canvas') {
  const {createNetworkCanvasWorker}=await import('./canvas-renderer-client.js');renderer=createNetworkCanvasWorker(canvas,recordPaint)
 } else if(spatial){const {createNetworkGPU3D}=await import('./webgpu-3d-renderer.js');renderer=await createNetworkGPU3D(canvas,message=>{if(disposed)return;gpuReady=false;simulation?.stop();status.textContent=(four?'N-D':'3D')+' WebGPU unavailable: '+message},requestRender,four?'N-D':'3D',()=>Number($('#camera-speed').value),moveFourth)}
 else renderer=await createNetworkGPU(canvas,message=>{if(disposed)return;console.error(message);gpuReady=false;simulation?.stop();cancelAnimationFrame(frame);frame=0;status.textContent='WebGPU graphics were lost. Reload to retry, or use the original Graph view.'},recordPaint)
 if(disposed){renderer.dispose();return}canvas.dataset.backend=renderer.backend || rendererKind;gpuReady=true;renderer.setCameraMode?.($('#network-camera-mode').value);$('#network-camera-mode').disabled=!spatial
 const resize=()=>{const width=host.clientWidth,height=host.clientHeight;renderer.resize(width,height);if(spatial){requestRender();return}if(fitted&&!spatial){const nextHeight=view.w/(width/Math.max(1,height));view.y+=(view.h-nextHeight)/2;view.h=nextHeight;requestRender()}}
 resize();resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host)
 const hit=event=>{
  if(spatial)return renderer.hit(event)
  const rect=canvas.getBoundingClientRect(),x=view.x+(event.clientX-rect.left)/rect.width*view.w,y=view.y+(event.clientY-rect.top)/rect.height*view.h
  for(let i=renderedGraphNodes.length-1;i>=0;i--){const n=renderedGraphNodes[i];if(visible.has(n.id)&&Math.hypot(x-n.x,y-n.y)<=radius(n))return {node:n}}
  const tolerance=6*view.w/rect.width
  for(const edge of renderedGraphEdges){if(!visibleEdges.has(edge.id))continue;const points=curvePoints(edge)
   for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)))
    if(Math.hypot(x-a.x-t*dx,y-a.y-t*dy)<=Math.max(tolerance,(edge.quantityWidth||1.4)*Number($('#link-width').value)/2))return {edge}
   }
  }return {}
 }
 if(!spatial){
  canvas.tabIndex=0
  canvas.setAttribute('aria-label','2D organization network. W zooms in, S zooms out, A pans left, D pans right, E pans up, Q pans down. Hold Shift for 10× speed; Control for 0.1× speed.')
  const keys=new Set(),navigationKeys=new Set(['KeyW','KeyS','KeyA','KeyD','KeyE','KeyQ'])
  let navigationFrame=0,lastNavigation=0,boosted=false,slowed=false
  const stopNavigation=()=>{boosted=false;slowed=false;keys.clear();cancelAnimationFrame(navigationFrame);navigationFrame=0;lastNavigation=0}
  const navigate=time=>{
   navigationFrame=0
   if(disposed||!keys.size)return
   const dt=lastNavigation?Math.min((time-lastNavigation)/1000,.05):0;lastNavigation=time
   const speed=Number($('#camera-speed').value)*(boosted?10:1)*(slowed?0.1:1),zoom=Number(keys.has('KeyW'))-Number(keys.has('KeyS'))
   if(zoom)zoomGPU(Math.exp(zoom*1.2*speed*dt))
   const x=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),y=Number(keys.has('KeyQ'))-Number(keys.has('KeyE')),length=Math.hypot(x,y)||1
   view.x+=x/length*view.w*.7*speed*dt;view.y+=y/length*view.h*.7*speed*dt
   requestRender();navigationFrame=requestAnimationFrame(navigate)
  }
  canvas.addEventListener('keydown',event=>{
   boosted=event.shiftKey;slowed=event.ctrlKey
   if(!navigationKeys.has(event.code)||event.metaKey||event.altKey)return
   event.preventDefault();keys.add(event.code);if(!navigationFrame)navigationFrame=requestAnimationFrame(navigate)
  },{signal:abort.signal})
  window.addEventListener('keyup',event=>{boosted=event.shiftKey;slowed=event.ctrlKey;keys.delete(event.code);if(!keys.size)stopNavigation()},{signal:abort.signal})
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
  const item=hit(event);const nextHover=item.node?.id||null;if(nextHover!==hovered){hovered=nextHover;labelPriority=[];requestRender()}if(selected)return;if(item.node)previewNode(item.node);else if(item.edge)previewEdge(item.edge);canvas.style.cursor=item.node||item.edge?'pointer':'grab'
 },{signal:abort.signal})
 const release=event=>{if(event.type==='pointerup'&&down&&Math.hypot(event.clientX-down.x,event.clientY-down.y)<6){const item=hit(event);if(item.node)activateNode(item.node.id);else if(item.edge)previewEdge(item.edge)}pointers.delete(event.pointerId);down=null;pinch=null;drag=null;if(pointers.size===1){const a=[...pointers.values()][0];drag={x:a.x,y:a.y,vx:view.x,vy:view.y}}}
 canvas.addEventListener('pointerup',release,{signal:abort.signal});canvas.addEventListener('pointercancel',release,{signal:abort.signal})
}
async function start(){
 try {
  await settingsReady
  try{const response=await fetch(new URL('network-default-positions.json',new URL(historyUrl,location.origin)),{signal:abort.signal});if(response.ok)defaultPositions=(await response.json()).organizations||{}}catch{/* New organizations still get deterministic initial coordinates. */}
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
  for(const control of visibilityControls.querySelectorAll('select,input'))control.addEventListener('input',()=>{if(control.id==='network-expanded-communities')restoreExpanded();if(control.id==='network-grouping'){expandedCommunities.clear();saveExpanded();updateCommunityList()}if(control.id==='network-size-metric')updateNodeSizes();if(control.id==='network-theme')applyTheme();if(control.id==='network-camera-mode')renderer.setCameraMode?.(control.value);if(control.id==='network-analysis-mode'||control.id.startsWith('network-flow-')||($('#network-analysis-mode').value==='geography'&&['network-grouping','network-expanded-communities'].includes(control.id))){updateAnalysisLayout();if(control.id!=='network-expanded-communities')fit()}updateDisclosure()},{signal:abort.signal})
  $('#network-home').addEventListener('click',()=>{unpin();fit()},{signal:abort.signal})
  $('#network-focus').addEventListener('click',()=>{const node=nodes.find(n=>n.id===selected);if(node)focusView(node)},{signal:abort.signal})
  $('#network-clear-selection').addEventListener('click',unpin,{signal:abort.signal})
  $('#network-reset-visibility').addEventListener('click',()=>{for(const control of visibilityControls.querySelectorAll('select,input')){if(control.tagName==='SELECT')control.value=([...control.options].find(o=>o.defaultSelected)||control.options[0]).value;else if(control.type==='checkbox')control.checked=control.defaultChecked;else control.value=control.defaultValue}expandedCommunities.clear();$('#network-expanded-communities').value='[]';updateNodeSizes();updateCommunityList();updateAnalysisLayout();applyTheme();renderer.setCameraMode?.('perspective');updateDisclosure();visibilityControls.querySelector('select').dispatchEvent(new Event('input',{bubbles:true}))},{signal:abort.signal})
  root.querySelectorAll('[name=node-category],[name=relationship],#include-context,#neighbors,#network-view,#hide-isolated,#scale-node-finances,#scale-edge-quantity,#node-size-algorithm').forEach(el=>el.addEventListener('change',rebuild))
  $('#live-physics').addEventListener('change',()=>{simulation?.motion(physicsEnabled(),true);requestRender()})
  for(const name of ['attraction','repulsion','proximity','central-gravity','dither','attraction-law','repulsion-law','attraction-alpha','repulsion-alpha'])$('#'+name).addEventListener('input',()=>{
   const output=$('#'+name+'-value');if(output)output.textContent=Number($('#'+name).value).toFixed(1)
   simulation?.stop()
   simulation=createNetworkLayout(nodes,layoutConnections(edges),forceOptions(),physicsEnabled(),reprojected=>{geometryDirty ||= reprojected;requestRender()});applyProjection()
   motionChange()
  })
  if(four){
   updateProjectionControls()
   for(const input of root.querySelectorAll('[id^="projection-"][type="range"],#life-perspective'))input.addEventListener('input',()=>{$('#'+input.id+'-value').textContent=input.value;applyProjection()})
   for(const id of ['projection-axis','projection-algorithm','display-dimensions','projection-seed','projection-slice-width'])$('#'+id).addEventListener('change',()=>{if($('#'+id).validity.valid)applyProjection(false,true)})
   $('#projection-refit').addEventListener('click',()=>applyProjection(true,true))
   $('#network-dimensions').addEventListener('change',()=>{
    if(!$('#network-dimensions').validity.valid)return
    updateProjectionControls();fitted=false;rebuild()
   })
   for(const id of ['radius','friction'])$('#life-'+id).addEventListener('change',()=>{simulation?.stop();simulation=createNetworkLayout(nodes,layoutConnections(edges),forceOptions(),physicsEnabled(),reprojected=>{geometryDirty ||= reprojected;requestRender()});applyProjection()})
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
  $('#network-reset').addEventListener('click',()=>{
   selected=null;inspectorKey=null;fitted=false;analysisLayout=null;networkCoordinates.clear();expandedCommunities.clear();renderer.setCameraMode?.('perspective');fourthPosition=Array(MAX_NETWORK_DIMENSIONS).fill(0)
   if(four)$('#life-w-position').textContent='0.00'
   savedPositions.clear();nodes=[]
   for(const el of root.querySelectorAll('.eco-network-controls input,.eco-network-controls select')){
    if(el.tagName==='SELECT')el.value=([...el.options].find(o=>o.defaultSelected)||el.options[0]).value
    else if(el.type==='checkbox')el.checked=el.defaultChecked
    else el.value=el.defaultValue
    const output=el.id&&$('#'+el.id+'-value')
    if(output)output.textContent=el.id==='link-width'?Number(el.value).toFixed(2):el.step==='0.1'?Number(el.value).toFixed(1):el.value
   }
   $('#live-physics').checked=!reducedMotion.matches;$('#neighbors').disabled=true
   $('#network-detail').innerHTML='<h2>Select an organization</h2>'
   history.replaceState(history.state,'',location.pathname);updateProjectionControls();search();rebuild()
  })
  const initial=new URL(location.href).searchParams.get('org');if(initial&&data.organizations.some(n=>n.id===initial)){select(initial);rebuild()}else rebuild()
  loadSharedNetworkData(JSON.stringify([location.origin,dataUrl,historyUrl,apiPrefix]), () => loadPortalEvidence(data, sharedEvidenceFetch,apiPrefix,(base,directory,records)=>prepareNetworkData(base,directory,records,historyData,new AbortController().signal)), abort.signal).then(prepared=>{if(disposed)return;preparedData=prepared;data=prepared.data;search();if(selected)select(selected);rebuild();$('#network-source').textContent=(usingOfflineCopy?'Offline · last checked ':'Checked ')+new Date(oldestCheck).toLocaleString()}).catch(()=>{if(disposed)return;$('#network-source').textContent='Saved public evidence · refresh unavailable'})
 }catch(error){if(disposed)return;status.textContent=error.message || 'WebGPU network unavailable.';host.hidden=true;console.error(error)}
}
const panelState=()=>{
 const active=root.classList.contains('eco-search-open')?'search':root.classList.contains('eco-visualization-open')?'visualization':root.classList.contains('eco-controls-open')?'controls':'inspector'
 for(const panel of ['search','visualization','controls','inspector']){
  const button=root.querySelector(`[data-panel="${panel}"]`),open=panel===active
  button.setAttribute('aria-selected',String(open));button.tabIndex=open?0:-1
  $('#'+button.getAttribute('aria-controls')).hidden=!open
 }
}
const selectPanel=panel=>{for(const name of ['search','visualization','controls','inspector'])root.classList.toggle('eco-'+name+'-open',name===panel);panelState()}
const initialPanel=new URL(location.href).searchParams.get('panel')
selectPanel(['search','visualization','controls','inspector'].includes(initialPanel)?initialPanel:'inspector')
root.querySelectorAll('[data-graph-type]').forEach(link=>{
 if(link.dataset.graphType==='4d')link.textContent='✧ N-D'
 if(link.dataset.graphType===(four?'4d':spatial?'3d':'2d'))link.setAttribute('aria-current','true')
 const org=new URL(location.href).searchParams.get('org');if(org){const url=new URL(link.getAttribute('href'),location.origin);url.searchParams.set('org',org);link.setAttribute('href',url.pathname+url.search)}
})
root.querySelectorAll('[data-panel]').forEach(button=>{
 button.addEventListener('click',()=>selectPanel(button.dataset.panel),{signal:abort.signal})
 button.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
  event.preventDefault()
  const panels=['search','visualization','controls','inspector'],index=panels.indexOf(button.dataset.panel)
  const panel=panels[event.key==='Home'?0:event.key==='End'?panels.length-1:(index+(event.key==='ArrowRight'?1:panels.length-1))%panels.length]
  selectPanel(panel);root.querySelector(`[data-panel="${panel}"]`).focus()
 },{signal:abort.signal})
})
rewriteLinks(); start();
return () => { disposed=true;simulation?.stop();abort.abort();resizeObserver?.disconnect();cancelAnimationFrame(frame);clearInterval(fpsTimer);renderer?.dispose();root.replaceChildren() };
}
