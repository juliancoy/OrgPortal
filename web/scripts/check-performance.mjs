import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
const origin=process.env.MAP_ORIGIN||'http://127.0.0.1:5187',live=!new URL(origin).hostname.match(/^(localhost|127\.0\.0\.1)$/)
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']})
try{
 const context=await browser.newContext(),page=await context.newPage(),errors=[],writes=[]
 page.on('pageerror',e=>errors.push(e.message))
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/org/')&&!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push(r.url())})
 if(!live){
  await page.route('**/api/**',r=>new URL(r.request().url()).pathname.startsWith('/api/')?r.fulfill({status:401,contentType:'application/json',body:'{}'}):r.continue())
  await page.route('**/pidp/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{}'}))
 }
 await mkdir('../artifacts/performance',{recursive:true})
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.goto(origin+'/ecosystem/network/performance',{waitUntil:'domcontentloaded'})
  await page.locator('[data-metric="reviewed-outcomes"]').waitFor({timeout:60000})
  assert.equal(await page.locator('[data-metric="reviewed-outcomes"]').innerText(),'3')
  assert.equal(await page.locator('[data-metric="federal-awards"]').innerText(),'10,888')
  assert.equal(await page.locator('.performance-card').count(),3)
  assert.match(await page.locator('.performance-card').first().innerText(),/Amick Farms/)
  assert.match(await page.locator('.performance-card').first().innerText(),/102.1% of target/)
  await page.getByLabel('Evidence view').selectOption('shortfalls')
  assert.equal(await page.locator('.performance-card').count(),2)
  assert.match(await page.locator('.performance-card').first().innerText(),/CD Capital/)
  assert.match(await page.locator('.performance-card').first().innerText(),/69.6% of target/)
  await page.getByText('Funding evidence and assessment',{exact:true}).first().click()
  assert.match(await page.locator('.performance-card').first().innerText(),/company-reported/)
  assert.match(await page.locator('.performance-card').first().innerText(),/2018-12-31/)
  await page.getByLabel('Evidence view').selectOption('strongest');assert.equal(await page.locator('.performance-card').count(),1)
  await page.getByLabel('Evidence view').selectOption('exposure');assert.equal(await page.locator('.performance-card').count(),25)
  await page.getByRole('button',{name:'Next',exact:true}).click();assert.match(await page.locator('.performance-controls').last().innerText(),/Page 2/)
  await page.getByLabel('Search recipient, award or agency').fill('Redacted');assert.equal(await page.locator('.performance-card').count(),25)
  assert.match(await page.locator('.eco-view-content').innerText(),/48 unidentified awards · \$2,066,483.31/)
  await page.getByLabel('Search recipient, award or agency').fill('');await page.getByLabel('Evidence view').selectOption('reviewed')
  const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert(dimensions.scrollWidth<=width+1)
  await page.screenshot({path:`../artifacts/performance/${live?'live':'local'}-${width}.png`})
 }
 const pdf=await context.request.get(origin+'/ecosystem-data/sources/maryland-medaaf-fy2019.pdf');assert.equal(pdf.status(),200);assert((await pdf.body()).subarray(0,4).equals(Buffer.from('%PDF')))
 const review=await context.request.get(origin+'/ecosystem-data/sources/maryland-medaaf-review.json');assert.equal(review.status(),200);assert.equal((await review.json()).assessments.length,3)
 if(!live){
  const failure=await browser.newContext(),p=await failure.newPage()
  await p.route('**/ecosystem-performance.json',r=>r.fulfill({status:503,body:'Unavailable'}))
  await p.goto(origin+'/ecosystem/network/performance');await p.getByRole('alert').waitFor();assert.equal(await p.locator('[data-metric]').count(),0);await failure.close()
 }
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[])
 const receipt={origin,widths:[1440,390],errors,writes,checks:['real snapshot','historical source labels','cohort ranking','shortfalls','unidentified signed totals','pagination','source PDF and review metadata',...(!live?['failure state']:[])]}
 await writeFile(`../artifacts/performance/${live?'live':'local'}-browser-check.json`,JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt))
}finally{await browser.close()}
