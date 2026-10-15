import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
const base={organizations:['Alpha','Beta'].map((name,i)=>({id:`fixture-${i}`,name:`Hover ${name}`,type:'Company',category:'company',publicEmails:[],sourceRows:[]})),relationships:[{id:'fixture-award',source:'fixture-0',target:'fixture-1',sourceLabel:'Hover Alpha',targetLabel:'Hover Beta',type:'Fixture grant',relationship:'funding',kind:'transfer',amount:100,currency:'USD',date:'2026-01-01',sourceUrl:'https://example.test/award',evidence:'Synthetic fixture',provenance:{sheet:'Fixture'}}],financing:[],dashboard:[]}
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader']})
try{
 const receipts=[]
 for(const mode of ['canvas','webgpu']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
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
  await hover({x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2})
  assert.equal(await detail.locator('h2').count(),2,'edge hover retains both endpoints in the right column')
  await labels.first().dispatchEvent('click');await detail.locator('[data-unpin-node]').waitFor()
  await labels.nth(1).dispatchEvent('pointerenter');assert.equal(await detail.locator('h2').innerText(),'Hover Alpha','pinning still locks the right column')
  await detail.locator('[data-unpin-node]').click();await labels.nth(1).dispatchEvent('pointerenter');assert.equal(await detail.locator('h2').innerText(),'Hover Beta')
  assert.equal(await page.locator('#network-labels [title]').count(),0);assert.deepEqual(errors,[])
  receipts.push({mode,nodeHover:true,edgeHover:true,keyboardFocus:true,pinning:true,floatingText:false,nativeTitles:false,errors});await page.close()
 }
 await mkdir('../artifacts/hover-panel',{recursive:true});await writeFile('../artifacts/hover-panel/browser-check.json',JSON.stringify(receipts,null,2)+'\n');console.log(JSON.stringify(receipts))
}finally{await browser.close()}
