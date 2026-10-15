import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium} from '@playwright/test'
const base='http://127.0.0.1:5187',redacted='13bb4caf-d044-488d-a79d-bd7f678be3be'
console.log('Launching browser')
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']})
try {
 console.log('Browser launched')
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[]
 page.on('pageerror',e=>{errors.push(e.message);console.log('Page error:',e.message)})
 page.on('console',m=>{if(m.type()==='error')console.log('Browser:',m.text())})
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname
  if(!path.startsWith('/api/'))return route.continue()
  const data=path.endsWith('/orgs/public')?[{id:redacted,name:'Redacted',slug:'redacted',tags:[]}]:path.endsWith('/relationships/public')?{records:[],nextRecordOffset:null}:{}
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 console.log('Opening graph')
 await page.goto(`${base}/ecosystem/network?org=${redacted}`,{waitUntil:'domcontentloaded'})
 console.log('Graph document loaded')
 await page.waitForTimeout(3000)
 console.log('Page:',page.url(),(await page.locator('body').innerText()).slice(0,1000))
 await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('links'),null,{timeout:90000})
 await page.waitForFunction(()=>document.querySelector('#network-detail')?.textContent.includes('Redacted'),null,{timeout:30000})
 console.log('Graph ready')
 const graphStatus=await page.locator('#network-status').textContent()
 assert.match(await page.locator('#network-detail').innerText(),/2,066,483/)
 await mkdir('../artifacts/government',{recursive:true})
 await page.screenshot({path:'../artifacts/government/network-desktop.png'})
 console.log('Opening relationships')
 await page.goto(`${base}/ecosystem/network/relationships?org=${redacted}`,{waitUntil:'domcontentloaded'})
 await page.waitForSelector('#network-table table',{timeout:90000})
 assert.equal(await page.locator('#network-table tbody tr').count(),48)
 assert.match(await page.locator('#network-table caption').innerText(),/48 awards/)
 assert.match(await page.locator('#network-table a').first().getAttribute('href'),/^https:\/\/www.usaspending.gov\/award\//)
 await page.screenshot({path:'../artifacts/government/redacted-awards.png'})
 await page.setViewportSize({width:390,height:844})
 console.log('Opening graph')
 await page.goto(`${base}/ecosystem/network?org=${redacted}`,{waitUntil:'domcontentloaded'})
 console.log('Graph document loaded')
 await page.waitForTimeout(3000)
 console.log('Page:',page.url(),(await page.locator('body').innerText()).slice(0,1000))
 await page.waitForFunction(()=>document.querySelector('#network-detail h2')?.textContent==='Redacted',null,{timeout:90000})
 const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight}))
 assert(dimensions.scrollWidth<=dimensions.width+1);assert(dimensions.scrollHeight<=dimensions.height+1)
 await page.screenshot({path:'../artifacts/government/network-mobile.png'})
 assert.deepEqual(errors,[])
 const receipt={graphStatus,redactedAwards:48,unidentifiedObligationsUsd:2066483.31,dimensions,errors}
 await writeFile('../artifacts/government/browser-check.json',JSON.stringify(receipt,null,2)+'\n')
 console.log(JSON.stringify(receipt))
}finally{await browser.close()}
