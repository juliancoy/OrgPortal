// Synthetic, host-only clickthrough: node direction, complete paging, visible failures and arrow rendering.
import {build} from 'esbuild'
import {readFile,mkdir} from 'node:fs/promises'
import {createServer} from 'node:http'
import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import {queryEcosystem,PAGE_SIZE} from '../server/ecosystem-query.mjs'
const root=new URL('../',import.meta.url).pathname,out=new URL('../../artifacts/layout-review/directed-neighborhood/',import.meta.url).pathname
await mkdir(out,{recursive:true})
const bundle=await build({stdin:{contents:`import {createNetworkCanvas} from './src/features/ecosystem/canvas-renderer.js';import {curvePoints} from './src/features/ecosystem/webgpu-renderer.js';import {edgeArrowGeometry} from './src/features/ecosystem/edge-arrows.js';window.arrowTest={createNetworkCanvas,curvePoints,edgeArrowGeometry};import markup from './src/features/ecosystem/markup.html';import './src/features/ecosystem/network.css';import './src/features/ecosystem/network-hierarchy.css';import {mountEcosystemNetworkGPU} from './src/features/ecosystem/network-webgpu.js';const root=document.querySelector('#root');root.innerHTML=markup;mountEcosystemNetworkGPU(root,{portalPath:p=>p,renderer:new URLSearchParams(location.search).get('renderer')||'canvas'});`,resolveDir:root,sourcefile:'directed-fixture.js'},bundle:true,write:false,outdir:out,format:'esm',loader:{'.html':'text'},plugins:[{name:'observe-renderer-input',setup(b){b.onLoad({filter:/network-webgpu\.js$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('const painted=renderer.render(view)',`window.reviewCenter=()=>{const node=nodes.find(n=>n.id===selected);if(!node)return null;const point=spatial?renderer.project(node):{x:(node.x-view.x)/view.w*host.clientWidth,y:(node.y-view.y)/view.h*host.clientHeight};return {id:selected,x:point.x/host.clientWidth,y:point.y/host.clientHeight,zoom:spatial?renderer.zoomLevel():view.w}};const painted=renderer.render(view)`).replace('renderer.update(renderedGraphNodes,renderedGraphEdges,','window.reviewGraph={nodes:renderedGraphNodes.map(n=>n.id),edges:renderedGraphEdges.map(e=>({source:e.source.id,target:e.target.id,directional:e.directional,quantityWidth:e.quantityWidth}))};renderer.update(renderedGraphNodes,renderedGraphEdges,'),loader:'js'}))}}]})
const organizations=[{id:'hub',name:'Hub'},...Array.from({length:260},(_,i)=>({id:'child-'+i,name:'Child '+i})),...Array.from({length:3},(_,i)=>({id:'parent-'+i,name:'Parent '+i}))].map(o=>({...o,category:'company',type:'Company',sourceRows:[],publicEmails:[]}))
const records=[...organizations.filter(o=>o.id.startsWith('child-')).flatMap((o,i)=>Array.from({length:i===0?1100:1},(_,row)=>({id:o.id+':'+row,source:'hub',target:o.id,sourceLabel:'Hub',targetLabel:o.name,relationship:'funding',kind:'transfer',currency:'USD',amount:1}))),...organizations.filter(o=>o.id.startsWith('parent-')).map(o=>({id:o.id,source:o.id,target:'hub',sourceLabel:o.name,targetLabel:'Hub',relationship:'funding',kind:'transfer',currency:'USD',amount:1}))]
const ids=new Map(organizations.map((o,i)=>[o.id,i])),adjacency=Object.fromEntries(organizations.map(o=>[o.id,new Set()])),edgesByOrg=Object.fromEntries(organizations.map(o=>[o.id,[]]))
records.forEach((e,i)=>{adjacency[e.source].add(e.target);adjacency[e.target].add(e.source);edgesByOrg[e.source].push(i);edgesByOrg[e.target].push(i)})
const topology={nodeIds:organizations.map(o=>o.id),adjacency:Object.fromEntries(Object.entries(adjacency).map(([id,set])=>[id,[...set].map(n=>ids.get(n))])),degree:Object.fromEntries(Object.entries(adjacency).map(([id,set])=>[id,set.size])),edgesByOrg,edges:records.map(e=>[ids.get(e.source),ids.get(e.target),e.kind])}
const read=async path=>{
 if(path==='manifest.json')return {version:'directed-fixture',generatedAt:'2026-11-03',totals:{organizations:organizations.length,relationships:records.length},groups:{},metricMax:{}}
 if(path.endsWith('/index.json'))return {rows:organizations.map(o=>({...o,search:o.name.toLowerCase()})),filters:{org:Object.fromEntries(organizations.map((o,i)=>[o.id,[i]]))},grams:{},gramCounts:{}}
 if(path.endsWith('topology.json'))return topology
 const match=path.match(/(organizations|graph)\/(\d+)\.json$/)
 if(match)return (match[1]==='organizations'?organizations:records).slice(Number(match[2])*PAGE_SIZE,(Number(match[2])+1)*PAGE_SIZE)
 throw Error('Unexpected fixture read '+path)
}
let failNext=false
const requests=[]
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost')
 if(url.pathname==='/fixture/fail-next'){failNext=true;res.end('ok');return}
 if(url.pathname.startsWith('/api/ecosystem/')){
  requests.push(url.search)
  if(failNext&&url.searchParams.get('org')){failNext=false;res.writeHead(503);res.end();return}
  try{const result=await queryEcosystem(read,url.pathname.endsWith('/graph')?'graph':'organizations',url.searchParams);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result.body))}catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}))}return
 }
 const file=bundle.outputFiles.find(f=>f.path.endsWith(url.pathname))
 if(file){res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'application/javascript');res.end(file.contents);return}
 res.setHeader('Content-Type','text/html');res.end('<html><link rel="stylesheet" href="/stdin.css"><body style="margin:0;font:14px system-ui"><div id="root" class="portal-ecosystem eco-page eco-graph-workspace" style="--eco-header-height:0px"></div><script type="module" src="/stdin.js"></script></body></html>')
})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader']})
try{
 const page=await browser.newPage({viewport:{width:1260,height:900},colorScheme:'dark',reducedMotion:'reduce'})
 await page.addInitScript(()=>{HTMLCanvasElement.prototype.transferControlToOffscreen=undefined;localStorage.setItem('orgportal.ecosystem.network.settings.2d',JSON.stringify({'network-label-mode':'all','live-physics':false}))})
 await page.goto(base)
 await page.locator('#network-labels button[aria-label^="Hub ·"]').click()
 await page.waitForFunction(()=>document.querySelector('#network-neighborhood-status')?.textContent.includes('All 263'))
 await page.getByLabel('Connection direction').selectOption('children')
 await page.waitForFunction(()=>document.querySelector('#network-neighborhood-status')?.textContent.includes('All 260 children'))
 await page.waitForFunction(()=>window.reviewGraph?.nodes.length===261)
 assert.equal(new Set((await page.evaluate(()=>window.reviewGraph.nodes))).size,261)
 assert((await page.evaluate(()=>window.reviewGraph.edges)).every(e=>e.source==='hub'&&e.directional))
 assert(requests.some(q=>q.includes('offset=249')),'the second node page was fetched')
 assert(requests.some(q=>q.includes('edgeOffset=1000')),'all transaction pages were fetched')
 await page.screenshot({path:out+'/children-2d.png'})
 await page.getByLabel('Connection direction').selectOption('parents')
 await page.waitForFunction(()=>document.querySelector('#network-neighborhood-status')?.textContent.includes('All 3 parents'))
 await page.waitForFunction(()=>window.reviewGraph?.nodes.length===4)
 assert((await page.evaluate(()=>window.reviewGraph.edges)).every(e=>e.target==='hub'&&e.directional))
 await page.request.get(base+'/fixture/fail-next')
 await page.getByLabel('Connection direction').selectOption('children')
 await page.locator('.eco-network-error').waitFor({state:'visible'})
 assert.match(await page.locator('.eco-network-error').innerText(),/HTTP 503/)
 await page.screenshot({path:out+'/visible-error.png'})
 await page.getByRole('button',{name:'Retry',exact:true}).click()
 await page.waitForFunction(()=>document.querySelector('#network-neighborhood-status')?.textContent.includes('All 260 children'))
 assert.equal(await page.locator('.eco-network-error').isVisible(),false)
 const arrowPixel=await page.evaluate(()=>{
  const {createNetworkCanvas,curvePoints,edgeArrowGeometry}=window.arrowTest,canvas=document.createElement('canvas'),renderer=createNetworkCanvas(canvas)
  const nodes=[{id:'s',x:40,y:0,renderRadius:5,category:'company'},{id:'t',x:340,y:0,renderRadius:5,category:'company'}],edge={id:'direction',source:nodes[0],target:nodes[1],quantityWidth:60,directional:true,relationship:'funding',opacity:1}
  renderer.resize(400,200);renderer.update(nodes,[edge],new Set(['s','t']),new Set(['direction']),null,{company:0x3366cc},()=>0xff8800);renderer.render({x:0,y:-100,w:400,h:200})
  const {head}=edgeArrowGeometry(curvePoints(edge),edge.quantityWidth,true),x=Math.round(head.base.x+head.length*.15),y=Math.round(100+head.halfWidth*.6)
  return [...canvas.getContext('2d').getImageData(x,y,1,1).data]
 })
 assert(arrowPixel[3]>0&&arrowPixel[0]>200,'the 2D arrowhead is actually painted beyond the shaft')
 console.log('Passed: actual node click; 260 children; 3 parents; complete node/record pagination; visible HTTP 503; retry recovery; directed 2D edges.')
 await page.close()
 const spatial=await browser.newPage({viewport:{width:1260,height:900},colorScheme:'dark',reducedMotion:'reduce'})
 await spatial.goto(base+'/?renderer=webgpu3d&org=parent-0&direction=children')
 await spatial.waitForFunction(()=>window.reviewGraph?.edges.length===1)
 await spatial.waitForTimeout(1500)
 await spatial.screenshot({path:out+'/arrow-3d.png'})
 assert.equal((await spatial.evaluate(()=>window.reviewGraph.edges))[0].directional,true)
 await spatial.close()
 for(const renderer of ['canvas','webgpu3d']){
  const centering=await browser.newPage({viewport:{width:1260,height:900},colorScheme:'dark',reducedMotion:'no-preference'})
  await centering.addInitScript(()=>{HTMLCanvasElement.prototype.transferControlToOffscreen=undefined;for(const mode of ['2d','3d'])localStorage.setItem('orgportal.ecosystem.network.settings.'+mode,JSON.stringify({'network-label-mode':'all','live-physics':false}))})
  await centering.goto(base+'/?renderer='+renderer+'&org=parent-0&direction=children')
  await centering.waitForFunction(()=>window.reviewCenter?.()?.id==='parent-0')
  await centering.waitForTimeout(600)
  const before=await centering.evaluate(()=>window.reviewCenter()),hub=centering.locator('#network-labels button[aria-label^="Hub ·"]')
  await hub.click()
  await centering.waitForTimeout(80)
  const during=await centering.evaluate(()=>window.reviewCenter())
  await centering.waitForFunction(()=>document.querySelector('#network-neighborhood-status')?.textContent.includes('All 260 children'))
  await centering.waitForFunction(()=>{const c=window.reviewCenter?.();return c?.id==='hub'&&Math.hypot(c.x-.5,c.y-.5)<.015})
  const after=await centering.evaluate(()=>window.reviewCenter())
  assert.equal(after.id,'hub');assert(Math.hypot(after.x-.5,after.y-.5)<.015,renderer+' centers the clicked node')
  assert(Math.hypot(during.x-.5,during.y-.5)>.005,renderer+' animates rather than snapping immediately')
  assert(Math.abs(after.zoom-before.zoom)/Math.max(1,before.zoom)<.02,renderer+' preserves zoom through neighborhood loading')
  // Clicking the same selected node must recenter it after a manual pan.
  const canvas=centering.locator('#network-canvas canvas'),box=await canvas.boundingBox()
  await centering.mouse.move(box.x+box.width*.3,box.y+box.height*.8);await centering.mouse.down();await centering.mouse.move(box.x+box.width*.3+100,box.y+box.height*.8+30,{steps:8});await centering.mouse.up()
  await centering.locator('#network-labels button[aria-label^="Hub ·"]').click()
  await centering.waitForFunction(()=>{const c=window.reviewCenter?.();return c?.id==='hub'&&Math.hypot(c.x-.5,c.y-.5)<.015})
  const repeated=await centering.evaluate(()=>window.reviewCenter());assert(Math.hypot(repeated.x-.5,repeated.y-.5)<.015,renderer+' recenters on repeated clicks')
  await centering.screenshot({path:out+'/centered-'+renderer+'.png'})
  console.log(renderer,'smooth centering, preserved zoom and repeated-click centering passed')
  await centering.close()
 }
}finally{await browser.close();server.close()}
