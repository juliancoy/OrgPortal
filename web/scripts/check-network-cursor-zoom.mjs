import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_BINARY?{executablePath:process.env.BROWSER_BINARY}:{}),args:['--no-sandbox']})
try {
 for(const mode of ['svg','webgl']){
  const page=await browser.newPage({viewport:{width:1440,height:900}})
  if(mode==='svg')await page.addInitScript(()=>{const old=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...a){return k.includes('webgl')?null:old.call(this,k,...a)}})
  await page.route('**/api/org/api/network/**',r=>r.fulfill({status:503,body:'Saved public evidence check'}))
  await page.goto((process.env.MAP_ORIGIN||'https://lifetech.fyi')+'/ecosystem/network',{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links'))
  await page.evaluate(()=>document.fonts.ready)
  if(mode==='webgl')assert(await page.locator('#network-canvas canvas').count(),'WebGL renderer unavailable')
  await page.locator('#network-labels button:not([hidden])').first().click()
  const marker=page.locator('#network-labels button[aria-pressed=true]')
  await marker.waitFor()
  await page.waitForFunction(()=>document.querySelector('#network-labels button[aria-pressed=true]')?.style.left)
  const point=()=>marker.evaluate(el=>{const b=el.parentElement.getBoundingClientRect();return {x:b.x+parseFloat(el.style.left),y:b.y+parseFloat(el.style.top)}})
  const before=await point()
  await page.mouse.move(before.x,before.y)
  for(const delta of [-120,120]){
   const changed=await page.locator('#network-labels button').evaluateAll(ns=>JSON.stringify(ns.map(n=>n.style.cssText)))
   await page.mouse.wheel(0,delta)
   await page.waitForFunction(old=>JSON.stringify([...document.querySelectorAll('#network-labels button')].map(n=>n.style.cssText))!==old,changed)
   const after=await point();assert(Math.hypot(after.x-before.x,after.y-before.y)<1,`${mode} cursor anchor drifted`)
  }
  assert.equal(await page.evaluate(()=>scrollY),0)
  console.log(mode,'zoom in/out retains node beneath cursor; page does not scroll')
  await page.close()
 }
}finally{await browser.close()}
