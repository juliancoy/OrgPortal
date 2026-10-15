import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {chromium} from '@playwright/test'
const government=JSON.parse(await readFile(new URL('../public/ecosystem-data/ecosystem-government.json',import.meta.url)))
const governmentUsd=government.relationships.reduce((sum,r)=>sum+Math.round(r.amount*100),0)/100
const dollars=n=>n.toLocaleString('en-US',{style:'currency',currency:'USD'})
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']})
try{
 const page=await browser.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 // Check saved-evidence behavior when the live API cannot be reached.
 await page.route('**/api/**',r=>new URL(r.request().url()).pathname.startsWith('/api/')?r.fulfill({status:503,body:'Unavailable for local read-only test'}):r.continue())
 await page.route('**/pidp/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{}'}))
 const receipts=[]
 await mkdir('../artifacts/government',{recursive:true})
 for(const [width,height] of [[1440,1000],[390,844]]){
  await page.setViewportSize({width,height})
  await page.goto('http://127.0.0.1:5187/ecosystem/network/overview',{waitUntil:'domcontentloaded'})
  await page.waitForSelector('[data-metric="tracked-usd"]',{timeout:60000})
  assert.equal(await page.locator('[data-metric="government-usd"]').innerText(),dollars(governmentUsd))
  assert.equal(await page.locator('[data-metric="redacted-usd"]').innerText(),'$2,066,483.31')
  assert.match(await page.locator('[role=status]').innerText(),/Saved public evidence/)
  assert.equal(await page.locator('[data-metric="companies-outside-maryland"]').innerText(),'9.95%')
  assert.equal(await page.locator('[data-metric="post-funding-departure-rate"]').innerText(),'Not yet measurable')
  const retention=page.locator('.eco-company-retention')
  assert.match(await retention.innerText(),/43 of 432 companies/)
  assert.match(await retention.innerText(),/2018 statewide snapshot/)
  assert.match(await retention.innerText(),/63 companies \(14.58%\)/)
  await retention.getByText('Company counts, calculation and source limits',{exact:true}).click()
  assert.match(await retention.innerText(),/not a current departure rate/)
  const preserved=await page.request.get(new URL(await retention.getByRole('link',{name:'Preserved source PDF'}).getAttribute('href'),page.url()).href)
  assert(preserved.ok());assert((await preserved.body()).subarray(0,5).toString()==='%PDF-')
  const totals=await page.locator('dl[aria-label="Network coverage"]').innerText()
  assert.match(totals,/16,463/)
  const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight}))
  assert(dimensions.scrollWidth<=width+1);assert(dimensions.scrollHeight<=height+1)
  await retention.scrollIntoViewIfNeeded()
  await page.screenshot({path:`../artifacts/government/overview-${width}.png`})
  const metrics=await page.locator('[data-metric]').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.dataset.metric,n.textContent])))
  receipts.push({width,height,metrics,dimensions})
 }
 await page.getByRole('link',{name:'View unidentified awards'}).click()
 assert.match(page.url(),/relationships\?org=13bb4caf/)
 await page.goto('http://127.0.0.1:5187/ecosystem/network/help',{waitUntil:'domcontentloaded'})
 await page.getByRole('link',{name:'Overview',exact:true}).click()
 await page.waitForSelector('[data-metric="tracked-usd"]',{timeout:60000})
 assert.deepEqual(errors,[])
 await writeFile('../artifacts/government/overview-browser-check.json',JSON.stringify({receipts,errors},null,2)+'\n')
 console.log(JSON.stringify({receipts,errors}))
}finally{await browser.close()}
