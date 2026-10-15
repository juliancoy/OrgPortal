import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium} from '@playwright/test'
const origin=process.env.MAP_ORIGIN||'http://127.0.0.1:5187'
const local=['localhost','127.0.0.1'].includes(new URL(origin).hostname)
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader']})
try{
 const receipts=[]
 for(const mode of ['canvas','webgpu']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  if(local)await page.route('**/api/org/api/network/**',r=>r.fulfill({status:503,body:'Saved evidence for read-only local check'}))
  await page.goto(origin+'/ecosystem/network'+(mode==='webgpu'?'/webgpu':''))
  await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links'),null,{timeout:60000})
  await page.waitForFunction(()=>/Checked |refresh unavailable|Offline/.test(document.querySelector('#network-source')?.textContent||''),null,{timeout:60000})
  assert.equal(await page.locator(`canvas[data-renderer=${mode}]`).count(),1)
  assert.equal(await page.locator('#central-gravity').inputValue(),'0')
  await page.locator('[data-panel=controls]').click()
  await page.locator('#live-physics').uncheck()
  const positions=()=>page.locator('#network-labels button').evaluateAll(ns=>JSON.stringify(ns.map(n=>[n.style.left,n.style.top])))
  await page.waitForTimeout(150);const paused=await positions()
  await page.locator('#central-gravity').evaluate(el=>{el.value='1.7';el.dispatchEvent(new Event('input'))})
  assert.equal(await page.locator('#central-gravity-value').textContent(),'1.7')
  await page.waitForTimeout(250);assert.equal(await positions(),paused,'changing gravity does not override pause')
  await page.locator('#live-physics').check()
  await page.waitForFunction(before=>JSON.stringify([...document.querySelectorAll('#network-labels button')].map(n=>[n.style.left,n.style.top]))!==before,paused)
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.waitForTimeout(200);const reduced=await positions()
  await page.locator('#central-gravity').evaluate(el=>{el.value='3';el.dispatchEvent(new Event('input'))})
  await page.waitForTimeout(250);assert.equal(await positions(),reduced,'reduced motion prevents gravity animation')
  await page.locator('#network-reset').click()
  assert.equal(await page.locator('#central-gravity').inputValue(),'0')
  assert.equal(await page.locator('#central-gravity-value').textContent(),'0.0')
  assert.equal(await page.locator('#live-physics').isChecked(),false)
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.setViewportSize({width:390,height:844})
  await page.locator('[data-panel=controls]').click()
  await page.locator('#central-gravity').scrollIntoViewIfNeeded()
  assert(await page.locator('#central-gravity').isVisible())
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
  assert.equal(overflow,false)
  await mkdir('../artifacts/central-gravity',{recursive:true})
  await page.screenshot({path:`../artifacts/central-gravity/${local?'local':'live'}-${mode}-mobile.png`})
  assert.deepEqual(errors,[]);receipts.push({mode,defaultOff:true,pause:true,motion:true,reducedMotion:true,reset:true,mobile:true,errors})
  await page.close()
 }
 await writeFile(`../artifacts/central-gravity/${local?'local':'live'}-browser-check.json`,JSON.stringify({origin,receipts},null,2)+'\n')
 console.log(JSON.stringify({origin,receipts}))
}finally{await browser.close()}
