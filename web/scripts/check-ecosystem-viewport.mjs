// Read-only viewport and wheel-zoom smoke check using saved public evidence.
import {chromium} from '@playwright/test'
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_BINARY?{executablePath:process.env.BROWSER_BINARY}:{}),args:['--no-sandbox']})
try{
 for(const origin of (process.env.MAP_ORIGINS || 'https://lifetech.fyi,https://medtech.social').split(',')){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
  if(process.env.ECOSYSTEM_RENDERER!=='webgl')await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind.includes('webgl')?null:original.call(this,kind,...args)}})
  await page.route('**/api/org/api/network/**',r=>r.fulfill({status:503,body:'Saved evidence check'}))
  await page.goto(origin+'/ecosystem/network')
  await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('links'),{},{timeout:60000})
  const bounds=async()=>page.evaluate(()=>({height:innerHeight,scroll:document.scrollingElement.scrollHeight,y:scrollY,canvas:document.querySelector('#network-canvas').getBoundingClientRect().toJSON()}))
  let b=await bounds();if(b.scroll>b.height+1||b.y||b.canvas.bottom>b.height+1||b.canvas.height<250)throw Error('Desktop does not fit viewport: '+JSON.stringify(b))
  const svg=page.locator('#network-canvas svg'),isSVG=Boolean(await svg.count())
  const node=page.locator('#network-labels button:not([hidden])').first();await node.hover();const before=await page.evaluate(svg=>svg?document.querySelector('#network-canvas svg').getAttribute('viewBox'):JSON.stringify([...document.querySelectorAll('#network-labels button')].slice(0,10).map(b=>b.style.cssText)),isSVG);await page.mouse.wheel(0,-120)
  await page.waitForFunction(({svg,old})=>(svg?document.querySelector('#network-canvas svg').getAttribute('viewBox'):JSON.stringify([...document.querySelectorAll('#network-labels button')].slice(0,10).map(b=>b.style.cssText)))!==old,{svg:isSVG,old:before})
  if((await bounds()).y!==0)throw Error('Wheel scrolled page')
  const controls=page.locator('.eco-network-controls');await controls.hover();await page.mouse.wheel(0,600)
  await page.waitForFunction(()=>document.querySelector('.eco-network-controls').scrollTop>0,{},{timeout:10000})
  await page.locator('[data-dialog=events]').click();if(!await page.locator('#eco-dialog-events').isVisible())throw Error('Events inaccessible')
  await page.locator('#eco-dialog-events header button').click()
  await page.locator('[data-dialog=sources]').click();if(!await page.locator('#network-table').isVisible())throw Error('Evidence inaccessible')
  await page.locator('#eco-dialog-sources header button').click()
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200)
  b=await bounds();if(b.scroll>b.height+1||b.y||b.canvas.bottom>b.height+1||b.canvas.height<200)throw Error('Mobile does not fit viewport: '+JSON.stringify(b))
  await page.locator('[data-panel=controls]').click();if(!await controls.isVisible())throw Error('Mobile filters inaccessible')
  await page.locator('[data-panel=controls]').click();await page.locator('[data-panel=inspector]').click();if(!await page.locator('#network-detail').isVisible())throw Error('Mobile details inaccessible')
  await page.locator('[data-panel=inspector]').click()
  await page.setViewportSize({width:900,height:480});await page.waitForTimeout(200);b=await bounds();if(b.scroll>b.height+1||b.canvas.height<100)throw Error('Short viewport scrolls')
  if(errors.length)throw Error(errors.join('\n'))
  console.log(origin,isSVG?'SVG':'WebGL','desktop/mobile/short viewport, wheel over labels, internal scrolling, events/sources dialogs passed')
  await page.close()
 }
}finally{await browser.close()}
