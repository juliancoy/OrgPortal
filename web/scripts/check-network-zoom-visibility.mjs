import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_BINARY?{executablePath:process.env.BROWSER_BINARY}:{}),args:['--no-sandbox']})
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}})
 await page.addInitScript(()=>{const old=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...args){return k.includes('webgl')?null:old.call(this,k,...args)}})
 await page.route('**/api/org/api/network/**',r=>r.fulfill({status:503,body:'Saved public evidence check'}))
 await page.goto((process.env.MAP_ORIGIN||'https://lifetech.fyi')+'/ecosystem/network',{waitUntil:'domcontentloaded'})
 await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links'))
 const visible=()=>page.locator('#network-canvas circle:visible').count()
 const overview=await visible()
 await page.getByRole('button',{name:'Graph settings',exact:true}).click()
 assert(await page.locator('#zoom-sparse').isChecked())
 await page.locator('#zoom-sparse').uncheck()
 await page.waitForFunction(()=>[...document.querySelectorAll('#network-canvas circle')].every(c=>c.style.display!=='none'))
 const total=await visible();assert(overview<total)
 await page.locator('#zoom-sparse').check()
 await page.waitForFunction(()=>[...document.querySelectorAll('#network-canvas circle')].some(c=>c.style.display==='none'))
 // Wheel zoom remains usable while settings are open.
 await page.locator('#network-canvas').hover();await page.mouse.wheel(0,-400)
 await page.waitForFunction(n=>[...document.querySelectorAll('#network-canvas circle')].filter(c=>c.style.display!=='none').length>n,overview)
 await page.locator('#network-fit').click()
 await page.locator('#visibility-factor').fill('16');await page.locator('#visibility-factor').dispatchEvent('input')
 await page.waitForFunction(n=>[...document.querySelectorAll('#network-canvas circle')].filter(c=>c.style.display!=='none').length<n,overview)
 console.log('Default visibility, reveal on zoom, adjustable factor, and disabling passed',{overview,total})
}finally{await browser.close()}
