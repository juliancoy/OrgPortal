import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_BINARY||'/usr/bin/google-chrome',args:['--no-sandbox']})
try{
 for(const mode of ['svg','webgl']){
  const page=await browser.newPage({viewport:{width:1440,height:900}})
  if(mode==='svg')await page.addInitScript(()=>{const old=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...a){return k.includes('webgl')?null:old.call(this,k,...a)}})
  await page.route('**/api/org/api/network/**',r=>r.fulfill({status:503,body:'Saved evidence'}))
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto((process.env.MAP_ORIGIN||'http://127.0.0.1:5193')+'/ecosystem/network')
  await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links'))
  const positions=()=>page.locator('#network-labels button').evaluateAll(ns=>JSON.stringify(ns.map(n=>n.style.cssText)))
  for(const name of ['attraction','repulsion','proximity']){
   await page.locator('#'+name).evaluate(el=>{el.value='1.5';el.dispatchEvent(new Event('input'))})
   assert.equal(await page.locator('#'+name+'-value').textContent(),'1.5')
  }
  const first=await positions();await page.waitForTimeout(300);assert.notEqual(await positions(),first,`${mode} should animate`)
  await page.locator('#live-physics').evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change'))})
  await page.waitForTimeout(100);const paused=await positions();await page.waitForTimeout(250);assert.equal(await positions(),paused,`${mode} should pause`)
  if(mode==='svg'){
   const moving=page.locator('[data-edge-id]:visible').first()
   const before=await moving.getAttribute('d')
   await page.locator('#live-physics').evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('change'))})
   await page.waitForTimeout(200);assert.notEqual(await moving.getAttribute('d'),before)
  }
  assert.deepEqual(errors,[]);console.log(mode,'motion, pause and geometry verified');await page.close()
 }
 const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1440,height:900}})
 await page.route('**/api/org/api/network/**',r=>r.fulfill({status:503,body:'Saved evidence'}))
 await page.goto((process.env.MAP_ORIGIN||'http://127.0.0.1:5193')+'/ecosystem/network')
 await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links'))
 assert.equal(await page.locator('#live-physics').isChecked(),false);console.log('reduced motion defaults to paused');await page.close()
}finally{await browser.close()}
