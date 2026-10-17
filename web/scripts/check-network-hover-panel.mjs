import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
const base={organizations:['Alpha','Beta'].map((name,i)=>({id:`fixture-${i}`,name:`Hover ${name}`,type:'Company',category:'company',publicEmails:[],sourceRows:[]})),relationships:[{id:'fixture-award',source:'fixture-0',target:'fixture-1',sourceLabel:'Hover Alpha',targetLabel:'Hover Beta',type:'Fixture grant',relationship:'funding',kind:'transfer',amount:100,currency:'USD',date:'2026-01-01',sourceUrl:'https://example.test/award',evidence:'Synthetic fixture',provenance:{sheet:'Fixture'}}],financing:[],dashboard:[]}
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader']})
try{
 const receipts=[]
 for(const mode of ['canvas','webgpu']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let layouts=0;page.on('worker',worker=>{if(worker.url().includes('network-layout'))layouts++});page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/ecosystem-data/ecosystem-*.json',r=>r.fulfill({json:r.request().url().endsWith('ecosystem-portal.json')?base:{organizations:[],relationships:[],financing:[]}}))
  await page.route('**/api/org/api/network/**',r=>r.fulfill({status:503,body:'Read-only synthetic fixture'}))
  await page.goto('http://127.0.0.1:5187/ecosystem/network'+(mode==='webgpu'?'/webgpu':''))
  await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links'))
  await page.waitForTimeout(500)
  await page.locator('#live-physics').evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change'))})
  await page.waitForTimeout(150)
  const labels=page.locator('#network-labels button'),detail=page.locator('#network-detail'),canvas=page.locator(`canvas[data-renderer=${mode}]`)
  assert.equal(await labels.count(),2)
  assert.equal(await page.locator('#network-tooltip').count(),0)
  assert.equal(await page.locator('.portal-ecosystem [title]').count(),0)
  assert.match(await labels.first().getAttribute('aria-label'),/Hover Alpha/)
  await labels.first().dispatchEvent('pointerenter');assert.equal(await detail.locator('h2').innerText(),'Hover Alpha')
  await labels.nth(1).focus();assert.equal(await detail.locator('h2').innerText(),'Hover Beta')
  const points=await labels.evaluateAll(ns=>ns.map(n=>({x:parseFloat(n.style.left),y:parseFloat(n.style.top)}))),box=await canvas.boundingBox()
  const hover=async p=>canvas.dispatchEvent('pointermove',{clientX:box.x+p.x,clientY:box.y+p.y})
  await hover(points[0]);assert.equal(await detail.locator('h2').innerText(),'Hover Alpha')
  const midpoint={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2}
  const linksLayout=layouts,linkPositions=await labels.evaluateAll(ns=>ns.map(n=>[n.style.left,n.style.top]))
  await page.locator('#show-links').evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change'))})
  await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('0 visible links'))
  await hover(midpoint);assert.equal(await detail.locator('h2').innerText(),'Hover Alpha','hidden links cannot capture hover')
  assert.equal(layouts,linksLayout);assert.deepEqual(await labels.evaluateAll(ns=>ns.map(n=>[n.style.left,n.style.top])),linkPositions,'hiding links does not change layout')
  await page.locator('#show-links').evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('change'))})
  await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('1 visible links'))
  await hover(midpoint)
  assert.equal(await detail.locator('h2').count(),2,'edge hover retains both endpoints in the right column')
  const before=await labels.evaluateAll(ns=>ns.map(n=>[n.style.left,n.style.top])),layoutCount=layouts
  const original=await labels.first().elementHandle()
  // Hit the circle artwork directly rather than its DOM text label.
  await labels.evaluateAll(ns=>ns.forEach(n=>n.style.pointerEvents='none'))
  await page.mouse.click(box.x+points[0].x,box.y+points[0].y)
  await page.waitForFunction(()=>new URL(location.href).searchParams.has('org'));await page.waitForTimeout(100)
  assert.deepEqual(await labels.evaluateAll(ns=>ns.map(n=>[n.style.left,n.style.top])),before,'pinning does not move circles')
  assert.equal(layouts,layoutCount,'pinning must not restart the layout worker')
  assert(await original.evaluate(n=>n.isConnected),'pinning does not replace graph labels')
  assert.match(await detail.innerText(),/Top recipient[\s\S]*Hover Beta · \$100/)
  await labels.nth(1).dispatchEvent('pointerenter');assert.equal(await detail.locator('h2').innerText(),'Hover Alpha','pinning still locks the right column')
  await page.locator('[data-panel="inspector"]').focus();await page.keyboard.press('Escape');await labels.nth(1).dispatchEvent('pointerenter');assert.equal(await detail.locator('h2').innerText(),'Hover Beta')
  assert.match(await detail.innerText(),/Top funder[\s\S]*Hover Alpha · \$100/)
  assert.equal(layouts,layoutCount,'closing the inspector must not restart the layout worker')
  assert.deepEqual(await labels.evaluateAll(ns=>ns.map(n=>[n.style.left,n.style.top])),before)
  assert.equal(await page.locator('#network-labels [title]').count(),0);assert.deepEqual(errors,[])
  receipts.push({mode,nodeHover:true,edgeHover:true,hideLinks:true,keyboardFocus:true,pinning:true,stableCirclePositions:true,stableLayoutWorker:true,topCounterparties:true,floatingText:false,nativeTitles:false,errors});await page.close()
 }
 await mkdir('../artifacts/hover-panel',{recursive:true});await writeFile('../artifacts/hover-panel/browser-check.json',JSON.stringify(receipts,null,2)+'\n');console.log(JSON.stringify(receipts))
}finally{await browser.close()}
