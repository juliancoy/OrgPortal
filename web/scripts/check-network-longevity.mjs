import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const origin=process.env.MAP_ORIGIN||'http://127.0.0.1:5193'
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_BINARY||'/usr/bin/google-chrome',args:['--no-sandbox']})
try {
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'})
 const page=await context.newPage(), errors=[],workers=new Set()
 page.on('worker',worker=>{workers.add(worker);worker.on('close',()=>workers.delete(worker))})
 page.on('pageerror',error=>errors.push(error.message))
 await page.addInitScript(()=>{
  window.networkTasks=[]
  new PerformanceObserver(list=>{for(const e of list.getEntries())window.networkTasks.push({start:e.startTime,duration:e.duration})}).observe({type:'longtask',buffered:true})
 })
 const orgs=Array.from({length:5000},(_,i)=>({id:`longevity-${i}`,name:`Medical organization ${i}`,slug:`longevity-${i}`,tags:[],description:'Synthetic graph refresh fixture'}))
 const records=orgs.slice(1,240).map((org,i)=>({id:`support:longevity-${i}`,record_type:'organization_support',from_organization_id:orgs[0].id,to_organization_id:org.id,transaction_type:'transfer',currency:'USD',amount:10000+i,description:'Synthetic public evidence',status:'active'}))
 await page.route('**/api/org/api/network/orgs/public?*',async route=>{const offset=Number(new URL(route.request().url()).searchParams.get('offset'));await new Promise(resolve=>setTimeout(resolve,offset===0?6000:20));await route.fulfill({json:orgs.slice(offset,offset+500)})})
 await page.route('**/api/org/api/network/relationships/public?*',route=>route.fulfill({json:{records,nextRecordOffset:null}}))
 await page.goto(origin+'/ecosystem/network')
 await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links'))
 await page.waitForFunction(()=>document.querySelector('#network-source')?.textContent.startsWith('Checked '))
 assert.equal(await page.locator('canvas[data-renderer=canvas]').count(),1)
 assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>/\/three(?:_|\.|\/)/.test(r.name))),false)
 console.log('Refreshed graph:',await page.locator('#network-status').textContent(),await page.locator('#network-labels button').count());
 assert.equal(await page.locator('#network-labels button').filter({hasText:'Medical organization '}).count(),240,'delayed refresh retains every connected fixture organization')
 const start=Date.now()
 while(Date.now()-start<65_000){
  await page.locator('#zoom-in').click({timeout:1500})
  await page.locator('#zoom-out').click({timeout:1500})
  await page.waitForTimeout(1000)
 }
 const tasks=await page.evaluate(()=>window.networkTasks.filter(t=>t.start>5000))
 const maxTask=Math.max(0,...tasks.map(t=>t.duration))
 assert.ok(maxTask<1000,`UI freeze during sustained graph use: ${maxTask}ms`)
 await page.locator('#live-physics').evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change'))})
 await page.locator('#network-fit').click()
 const label=page.locator('#network-labels button:not([hidden])').first()
 await label.click();await page.locator('[data-unpin-node]').waitFor();assert.ok(new URL(page.url()).searchParams.get('org'))
 await page.reload();await page.locator('[data-unpin-node]').waitFor();await page.locator('[data-unpin-node]').click()
 assert.equal(new URL(page.url()).searchParams.has('org'),false)
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({mode:'canvas',durationSeconds:65,maxLongTaskMs:maxTask,directoryNodes:orgs.length,connectedFixtureNodes:240,pinReload:true,errors},null,2))
 await page.setViewportSize({width:390,height:844});await page.reload()
 await page.locator('canvas[data-renderer=canvas]').waitFor()
 await page.locator('#network-fit').click();assert.deepEqual(errors,[])
 assert.ok(workers.size<=2,'only paint and layout workers remain after rebuilding')
 await page.goto('about:blank');await page.waitForTimeout(100);assert.equal(workers.size,0,'navigation releases graph workers')
 console.log('Mobile canvas, controls, and worker cleanup verified')
} finally {await browser.close()}
