import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
const base={organizations:['Source','Small','Large','Peer'].map((name,i)=>({id:`spatial-${i}`,name,type:'Company',category:'company',publicEmails:[],sourceRows:[]})),relationships:[100,900,400].map((amount,i)=>({id:`3d-award-${i}`,source:'spatial-0',target:`spatial-${i+1}`,sourceLabel:'Source',targetLabel:baseNames(i),kind:'transfer',relationship:'funding',type:'Fixture funding',currency:'USD',amount,sourceUrl:`https://example.test/${i}`,provenance:{sheet:'Synthetic fixture'}})),financing:[]}
function baseNames(i){return ['Small','Large','Peer'][i]}
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader']})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[]
 page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)})
 page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))console.log('CONSOLE',m.text())})
 await context.addInitScript(()=>{
  window.spatialGraphs=[];window.gpuErrors=[];window.webgpuConfigured=0
  const send=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message,...rest){if(message?.type==='graph'&&message.options.dimensions===3)window.spatialGraphs.push(message.nodes);return send.call(this,message,...rest)}
  if(typeof GPUCanvasContext==='undefined'||typeof GPUAdapter==='undefined')return
  const configure=GPUCanvasContext.prototype.configure;GPUCanvasContext.prototype.configure=function(...args){window.webgpuConfigured++;return configure.apply(this,args)}
  const device=GPUAdapter.prototype.requestDevice;GPUAdapter.prototype.requestDevice=async function(...args){const d=await device.apply(this,args);d.addEventListener('uncapturederror',e=>window.gpuErrors.push(e.error.message));return d}
 })
 await context.route('**/ecosystem-data/ecosystem-*.json',r=>r.fulfill({json:r.request().url().endsWith('ecosystem-portal.json')?base:{organizations:[],relationships:[],financing:[]}}))
 await context.route('**/api/org/api/network/**',r=>r.fulfill({status:503,body:'Synthetic read-only fixture'}))
 await context.route('**/pidp/**',r=>r.fulfill({status:401,body:'{}'}))
 await page.goto('http://127.0.0.1:5187/ecosystem/network/3d',{waitUntil:'domcontentloaded'})
 await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links')||/unavailable|required|not available/.test(document.querySelector('#network-status')?.textContent||''),null,{timeout:90000})
 console.log('STATUS',await page.locator('#network-status').innerText())
 assert.match(await page.locator('#network-status').innerText(),/visible links/)
 await page.waitForFunction(()=>document.querySelectorAll('#network-labels button:not([hidden])').length>0,null,{timeout:90000})
 assert.equal(await page.locator('canvas[data-renderer=webgpu3d]').count(),1)
 assert.equal(await page.locator('a[aria-current=page]').innerText(),'3D WebGPU')
 const graph=await page.evaluate(()=>window.spatialGraphs.at(-1));assert.equal(graph.length,4);assert(new Set(graph.map(n=>n.z)).size>2)
 assert.equal(await page.locator('#live-physics').isChecked(),false)
 const positions=()=>page.locator('#network-labels button').evaluateAll(ns=>ns.map(n=>[n.style.left,n.style.top]))
 const before=await positions(),canvas=page.locator('canvas[data-renderer=webgpu3d]'),box=await canvas.boundingBox()
 await page.mouse.move(box.x+25,box.y+25);await page.mouse.down();await page.mouse.move(box.x+160,box.y+95,{steps:8});await page.mouse.up();await page.waitForTimeout(150)
 assert.notDeepEqual(await positions(),before,'orbit changes the 3D projection')
 const orbit=await positions();await page.locator('#zoom-in').click();await page.waitForTimeout(100);assert.notDeepEqual(await positions(),orbit,'zoom changes perspective')
 await page.locator('#network-fit').click();await page.waitForTimeout(100)
 const label=page.locator('#network-labels button:not([hidden])').first(),point=await label.evaluate(n=>({x:parseFloat(n.style.left),y:parseFloat(n.style.top)})),count=await page.evaluate(()=>window.spatialGraphs.length),stable=await positions()
 await page.locator('#network-labels button').evaluateAll(ns=>ns.forEach(n=>n.style.pointerEvents='none'))
 await page.mouse.click(box.x+point.x,box.y+point.y)
 await page.locator('[data-unpin-node]').waitFor();assert.equal(await page.evaluate(()=>window.spatialGraphs.length),count);assert.deepEqual(await positions(),stable,'pinning does not move the spatial layout')
 assert.match(await page.locator('#network-detail').innerText(),/Top (funder|recipient)/)
 await page.locator('[data-unpin-node]').click()
 await page.locator('[data-panel=controls]').click();await page.locator('#show-links').uncheck();await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('0 visible links'))
 await page.locator('#show-links').check();await page.locator('#central-gravity').evaluate(n=>{n.value='1';n.dispatchEvent(new Event('input'))});await page.locator('#dither').evaluate(n=>{n.value='1';n.dispatchEvent(new Event('input'))})
 await page.waitForTimeout(200);assert.equal(await page.locator('#live-physics').isChecked(),false)
 await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#live-physics').check()
 const still=await positions();await page.waitForFunction(before=>JSON.stringify([...document.querySelectorAll('#network-labels button')].map(n=>[n.style.left,n.style.top]))!==JSON.stringify(before),still)
 await page.waitForTimeout(500);await page.locator('#live-physics').uncheck();await page.emulateMedia({reducedMotion:'reduce'})
 await page.locator('[data-panel=controls]').click()
 await mkdir('../artifacts/graph-3d',{recursive:true});await page.screenshot({path:'../artifacts/graph-3d/desktop.png'})
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);await page.screenshot({path:'../artifacts/graph-3d/mobile.png'})
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.gpuErrors),[]);assert((await page.evaluate(()=>window.webgpuConfigured))>0)
 const receipt={depth:true,nativeWebGPU:true,orbit:true,zoom:true,selection:true,topCounterparties:true,hideLinks:true,reducedMotion:true,animated3D:true,mobile:true,errors}
 await page.goto('about:blank');await page.waitForTimeout(100);assert.deepEqual(errors,[])
 const unsupported=await browser.newContext();await unsupported.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined}));const p=await unsupported.newPage()
 await p.route('**/ecosystem-data/ecosystem-*.json',r=>r.fulfill({json:r.request().url().endsWith('ecosystem-portal.json')?base:{organizations:[],relationships:[],financing:[]}}))
 await p.goto('http://127.0.0.1:5187/ecosystem/network/3d',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links'));assert.equal(await p.locator('canvas').getAttribute('data-backend'),'webgl2');receipt.webglFallback=true
 await writeFile('../artifacts/graph-3d/browser-check.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt))
}finally{await browser.close()}
