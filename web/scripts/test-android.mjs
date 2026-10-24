// Real Android Chrome, synthetic data, no production accounts or writes.
import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {fixtureServer} from './fixture-server.mjs'
const root=fileURLToPath(new URL('../',import.meta.url))
const output=resolve(process.env.MOBILE_OUTPUT||'/work/mobile-artifacts')
await mkdir(output,{recursive:true})
const {server,base}=await fixtureServer(root,output,Number(process.env.MOBILE_SERVER_PORT))
let browser,page
const checks=[]
try {
 browser=await chromium.connectOverCDP(process.env.PLAYWRIGHT_CDP_URL,{timeout:20000})
 const context=browser.contexts()[0]
 page=await context.newPage()
 await page.bringToFront()
 await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort())
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 for(const [name,path,ready] of [
  ['organizations','/orgs','h1'],['people','/people','h1'],['events','/events','h1'],
  ['application-options','/event-apply-options?brand=lifetech','.event-apply-actions'],
  ['submission-touch','/submissions?brand=lifetech&submissionReview=1','.submission-voting-card'],
 ]) {
  const started=performance.now()
  await page.goto(base+path,{waitUntil:'networkidle',timeout:30000})
  await page.locator(ready).first().waitFor()
  const device=await page.evaluate(()=>({userAgent:navigator.userAgent,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,touch:navigator.maxTouchPoints}))
  if(!/Android/.test(device.userAgent)||!device.touch)throw Error('Expected physical Android Chrome with touch input')
  if(name==='application-options') {
   const link=page.getByRole('link',{name:'Registered Apply',exact:true})
   if(await link.getAttribute('href')!=='/events/lifetech-demo-day-3/apply')throw Error('Incorrect application destination')
  }
  if(name==='submission-touch') {
   const details=page.locator('.submission-card-details')
   if(await details.isVisible())throw Error('Submission should initially be collapsed')
   const control=page.getByRole('button',{name:'Expand submission: The Limits of Contemporary Medicine',exact:true})
   await control.scrollIntoViewIfNeeded()
   const box=await control.boundingBox()
   const cdp=await context.newCDPSession(page)
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]})
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
   await cdp.detach()
   await details.waitFor({state:'visible'})
  }
  if(errors.length)throw Error(errors.join('\n'))
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error(name+' overflows the phone viewport')
  await page.screenshot({path:join(output,name+'.png'),fullPage:true})
  const check={name,status:'passed',duration_seconds:(performance.now()-started)/1000,device}
  checks.push(check);console.log(JSON.stringify({kind:'mobile_check',...check}))
 }
} catch(error) {
 checks.push({name:'mobile browser',status:'failed',error:String(error)})
 if(page)await page.screenshot({path:join(output,'failure.png')}).catch(()=>{})
 process.exitCode=1
} finally {
 await writeFile(join(output,'mobile-report.json'),JSON.stringify({mode:'physical-android-synthetic-fixtures',checks},null,2))
 if(page)await page.close().catch(()=>{})
 if(browser)await browser.close()
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
}
