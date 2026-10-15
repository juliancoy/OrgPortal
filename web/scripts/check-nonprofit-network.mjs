import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {chromium} from '@playwright/test'
const data=JSON.parse(await readFile(new URL('../public/ecosystem-data/ecosystem-nonprofits.json',import.meta.url)))
assert.equal(data.nonprofitProfiles.length,6)
assert.equal(data.relationships.length,3938)
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']})
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/api/**',r=>new URL(r.request().url()).pathname.startsWith('/api/')?r.fulfill({status:503,body:'Saved evidence test'}):r.continue())
 await page.route('**/pidp/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{}'}))
 const receipts=[];await mkdir('../artifacts/nonprofits',{recursive:true})
 for(const [width,height] of [[1440,1000],[390,844]]){
  await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:5187/ecosystem/network/nonprofits',{waitUntil:'domcontentloaded'})
  await page.waitForSelector('.eco-table tbody tr',{timeout:60000})
  assert.equal(await page.locator('.eco-table tbody tr').count(),6)
  const abell=page.locator('.eco-table tbody tr').filter({hasText:'THE ABELL FOUNDATION INC'})
  assert.match(await abell.innerText(),/13,445,692/);assert.match(await abell.innerText(),/18,185,484/)
  await page.locator('section.eco-view-content').getByRole('searchbox').fill('52-6036106');assert.equal(await page.locator('.eco-table tbody tr').count(),1)
  const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight}))
  assert(dimensions.scrollWidth<=width+1);assert(dimensions.scrollHeight<=height+1)
  await page.screenshot({path:`../artifacts/nonprofits/nonprofits-${width}.png`})
  receipts.push({width,height,dimensions})
 }
 await page.getByRole('link',{name:'Grant relationships →'}).click()
 await page.waitForSelector('#network-table tbody tr',{timeout:60000})
 assert.match(await page.locator('section.eco-view-content').innerText(),/480 relationships/)
 await page.locator('section.eco-view-content').getByRole('searchbox').fill('future')
 await page.waitForTimeout(150)
 assert.match(await page.locator('section.eco-view-content').innerText(),/89 relationships/)
 await page.goto('http://127.0.0.1:5187/ecosystem/network/overview',{waitUntil:'domcontentloaded'})
 await page.waitForSelector('[data-metric="tracked-usd"]',{timeout:60000})
 assert.equal(await page.locator('[data-metric="government-usd"]').innerText(),'$79,912,046,069.71')
 assert.equal(await page.locator('[data-metric="other-usd"]').innerText(),'$593,470,690.00')
 assert.match(await page.locator('section.eco-view-content').innerText(),/6 profiles and 3,938 grant observations/)
 assert.deepEqual(errors,[])
 await writeFile('../artifacts/nonprofits/browser-check.json',JSON.stringify({receipts,errors},null,2)+'\n')
 console.log(JSON.stringify({receipts,nonprofits:6,grantObservations:3938,reportedCashGrants:271225559,futureApprovals:71180065,errors}))
}finally{await browser.close()}
