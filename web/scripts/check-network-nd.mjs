import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
const origin=process.env.NETWORK_TEST_ORIGIN||'http://127.0.0.1:5187'
const fixture={organizations:Array.from({length:5},(_,i)=>({id:`nd-${i}`,name:`Organization ${i}`,type:'Company',category:'company',publicEmails:[],sourceRows:[]})),relationships:Array.from({length:4},(_,i)=>({id:`edge-${i}`,source:'nd-0',target:`nd-${i+1}`,kind:'transfer',relationship:'funding',type:'Funding',currency:'USD',amount:100,sourceUrl:'https://example.test/evidence',provenance:{sheet:'Synthetic fixture'}})),financing:[]}
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader']})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await context.addInitScript(()=>{
  window.ndGraphs=[];window.ndFrames=[]
  const NativeWorker=window.Worker
  window.Worker=class extends NativeWorker{
   constructor(url,options){super(url,options);if(String(url).includes('network-layout-4d'))this.addEventListener('message',e=>window.ndFrames.push(Array.from(e.data)))}
   postMessage(message,...rest){if(message.type==='graph'&&message.options.dimensions>=4)window.ndGraphs.push(message);return super.postMessage(message,...rest)}
  }
 })
 await context.route('**/ecosystem-data/ecosystem-*.json',r=>r.fulfill({json:r.request().url().endsWith('ecosystem-portal.json')?fixture:{organizations:[],relationships:[],financing:[]}}))
 await context.route('**/ecosystem-data/network-default-positions.json',r=>r.fulfill({json:{organizations:{}}}))
 await context.route('**/api/org/api/network/**',r=>r.fulfill({status:503,body:'Synthetic fixture'}))
 await context.route('**/__nd-fixture*',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><body><div id="root" class="portal-ecosystem eco-page"></div><script type="module">
 import markup from '/src/features/ecosystem/markup.html?raw';
 import '/src/features/ecosystem/network.css';
 import {networkNDControls} from '/src/features/ecosystem/nd-controls.js';
 import {mountEcosystemNetworkGPU} from '/src/features/ecosystem/network-webgpu.js';
 const root=document.querySelector('#root');root.innerHTML=markup;
 root.querySelector('.eco-network-controls').insertAdjacentHTML('afterbegin',networkNDControls());
 window.cleanup=mountEcosystemNetworkGPU(root,{renderer:'webgpu4d',dataUrl:'/ecosystem-data/ecosystem-portal.json',historyUrl:'/ecosystem-data/ecosystem-relationships.json',apiPrefix:'/api/org/api/network',portalPath:p=>p});
 </script></body></html>`}))
 await page.goto(origin+'/__nd-fixture')
 await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links'),null,{timeout:60000})
 await page.locator('[data-panel=controls]').click()
 await page.locator('.eco-network-advanced summary').click()
 await page.locator('#network-detail-mode').selectOption('all')
 await page.locator('#network-label-mode').selectOption('all')
 for(const dimensions of [8,16,32]){
  await page.locator('#network-dimensions').fill(String(dimensions));await page.locator('#network-dimensions').press('Tab')
  await page.waitForFunction(d=>window.ndGraphs.at(-1)?.options.dimensions===d&&window.ndFrames.at(-1)?.length===5*d*2,dimensions).catch(async error=>{console.log(await page.evaluate(()=>({status:document.querySelector('#network-status')?.textContent,graphs:window.ndGraphs.map(g=>({dimensions:g.options.dimensions,nodes:g.nodes.length})),frames:window.ndFrames.map(f=>f.length)})));throw error})
  const graph=await page.evaluate(()=>window.ndGraphs.at(-1))
  assert.equal(graph.edges.length,4);assert(graph.nodes.every(n=>n.q.length===dimensions&&n.velocityND.length===dimensions))
 }
 const simulations=await page.evaluate(()=>window.ndGraphs.length)
 for(const algorithm of ['perspective','orthographic','pca','random','radial','slice']){
  await page.locator('#projection-algorithm').selectOption(algorithm)
  if(algorithm==='slice'){await page.locator('#projection-slice-width').fill('1200');await page.locator('#projection-slice-width').dispatchEvent('change')}
  if(algorithm==='pca')await page.locator('#projection-refit').click()
  if(algorithm==='random'){await page.locator('#projection-seed').fill('42');await page.locator('#projection-seed').dispatchEvent('change')}
  for(const displayed of ['2','3']){
   await page.locator('#display-dimensions').selectOption(displayed)
   await page.waitForFunction(()=>[...document.querySelectorAll('#network-labels button:not([hidden])')].some(n=>n.style.left&&n.style.top)).catch(async error=>{console.log({algorithm,displayed,status:await page.locator('#network-status').innerText()});throw error})
   assert.equal(await page.evaluate(()=>window.ndGraphs.length),simulations,'projection changes must not restart the simulation')
  }
 }
 await page.locator('#projection-algorithm').selectOption('random')
 await page.locator('#display-dimensions').selectOption('2')
 await page.locator('#projection-axis').selectOption('31')
 const frames=await page.evaluate(()=>window.ndGraphs.length)
 const before=await page.locator('#network-labels button').evaluateAll(ns=>ns.map(n=>n.style.left+','+n.style.top))
 await page.locator('#projection-31-0').evaluate(n=>{n.value='90';n.dispatchEvent(new Event('input',{bubbles:true}))})
 await page.waitForFunction(before=>JSON.stringify([...document.querySelectorAll('#network-labels button')].map(n=>n.style.left+','+n.style.top))!==JSON.stringify(before),before)
 assert.equal(await page.evaluate(()=>window.ndGraphs.length),frames,'view rotation must not restart physics')
 await page.reload()
 await page.waitForFunction(()=>window.ndGraphs.at(-1)?.options.dimensions===32)
 assert.equal(await page.locator('#projection-algorithm').inputValue(),'random')
 assert.equal(await page.locator('#display-dimensions').inputValue(),'2')
 assert.equal(await page.locator('#projection-axis').inputValue(),'31')
 assert.equal(await page.locator('#projection-31-0').inputValue(),'90')
 await page.locator('[data-panel=controls]').click()
 await page.locator('.eco-network-advanced summary').click()
 assert.equal(await page.locator('[data-projection-axis="31"]').isVisible(),true)
 await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#live-physics').check()
 const count=await page.evaluate(()=>window.ndFrames.length)
 await page.waitForFunction(count=>window.ndFrames.length>count+2,count)
 assert(await page.evaluate(()=>window.ndFrames.at(-1).every(Number.isFinite)))
 await page.locator('#live-physics').uncheck()
 await page.locator('canvas').focus();await page.keyboard.down('e');await page.waitForTimeout(250);await page.keyboard.up('e')
 assert(Number(await page.locator('#life-w-position').textContent())>0,'E moves along the selected hidden axis')
 await page.setViewportSize({width:390,height:844})
 await page.screenshot({path:'/tmp/orgportal-nd-controls.png'})
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await page.locator('#network-reset').click()
 await page.waitForFunction(()=>window.ndGraphs.at(-1)?.options.dimensions===4)
 assert.equal(await page.locator('#projection-axis').inputValue(),'3')
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({dimensions:[8,16,32],projection:true,algorithms:6,independentDisplayDimensions:true,workerStride:true,animated:true,hiddenAxisMovement:true,mobile:true,settingsReload:true,reset:true,errors}))
}finally{await browser.close()}
