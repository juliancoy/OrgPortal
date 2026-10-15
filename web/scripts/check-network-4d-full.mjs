import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader']})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await context.addInitScript(()=>{window.fourFrames=0;window.fourNodes=0;window.gpuErrors=[];const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',e=>{if(e.data instanceof Float64Array&&String(args[0]).includes('4d')){window.fourFrames++;window.fourNodes=e.data.length/8;if(![...e.data].every(Number.isFinite))window.gpuErrors.push('Nonfinite 4D state')}})}};if(typeof GPUAdapter==='undefined')return;const request=GPUAdapter.prototype.requestDevice;GPUAdapter.prototype.requestDevice=async function(...args){const d=await request.apply(this,args);d.addEventListener('uncapturederror',e=>window.gpuErrors.push(e.error.message));return d}})
 await context.route('**/api/org/api/network/**',r=>r.fulfill({status:503,body:'Read-only snapshot acceptance check'}))
 await context.route('**/pidp/**',r=>r.fulfill({status:401,body:'{}'}))
 await page.goto('http://127.0.0.1:5187/ecosystem/network/4d',{waitUntil:'domcontentloaded'})
 await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links'),null,{timeout:120000})
 await page.waitForFunction(()=>window.fourNodes>1000,null,{timeout:120000})
 await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('[data-panel=controls]').click();await page.locator('#live-physics').check()
 const start=await page.evaluate(()=>window.fourFrames)
 await page.waitForFunction(start=>window.fourFrames>=start+15,start,{timeout:120000})
 await page.locator('#live-physics').uncheck();await page.locator('[data-panel=controls]').click();await page.locator('#network-fit').click();await page.waitForTimeout(500)
 const receipt=await page.evaluate(()=>({nodes:window.fourNodes,frames:window.fourFrames,status:document.querySelector('#network-status').textContent,gpuErrors:window.gpuErrors}))
 assert.deepEqual(errors,[]);assert.deepEqual(receipt.gpuErrors,[])
 await mkdir('../artifacts/graph-4d',{recursive:true});await page.screenshot({path:'../artifacts/graph-4d/full-dataset.png'});await writeFile('../artifacts/graph-4d/full-dataset-check.json',JSON.stringify({...receipt,errors},null,2)+'\n');console.log(JSON.stringify(receipt))
}finally{await browser.close()}
