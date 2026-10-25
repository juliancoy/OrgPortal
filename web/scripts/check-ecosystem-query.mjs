import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium} from 'playwright'
const origin=process.env.NETWORK_TEST_ORIGIN||'http://127.0.0.1:5193'
assert(['127.0.0.1','localhost'].includes(new URL(origin).hostname))
const browser=await chromium.launch({headless:true}),receipt=[]
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport,ignoreHTTPSErrors:true}),errors=[],requests=[]
  page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message)});page.on('request',r=>requests.push(r.url()))
  await page.route('**/__ecosystem-query-fixture*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">import {injectIntoGlobalHook} from "/@react-refresh";injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;</script><script type="module" src="/scripts/ecosystem-query-fixture.tsx"></script></body></html>'}))
  await page.route('**/pidp/**',r=>r.fulfill({status:401,json:{}}))
  for(const [route,selector] of [['overview','[data-metric="tracked-usd"]'],['relationships','#network-table tbody tr'],['events','#event-results li'],['nonprofits','.eco-table tbody tr'],['funding','.eco-table tbody tr'],['performance','.performance-card']]){
   const started=performance.now()
   await page.goto(origin+'/__ecosystem-query-fixture?view='+route,{waitUntil:'domcontentloaded',timeout:120000});await page.locator(selector).first().waitFor({timeout:60000})
   console.log('checked',viewport.width,route);receipt.push({viewport,route,readyMs:Math.round(performance.now()-started),rows:await page.locator(selector).count()})
   if(route==='relationships'){
    assert(await page.locator('#network-table tbody tr').count()<=100)
    const first=await page.locator('#network-table tbody tr').first().textContent();await page.getByRole('button',{name:'Next',exact:true}).click()
    await page.waitForFunction(first=>{const text=document.querySelector('#network-table tbody tr')?.textContent;return Boolean(text)&&text.replace(/\s+/g,'')!==first.replace(/\s+/g,'')},first)
    await page.getByLabel('Search relationships',{exact:true}).fill('TEDCO');await page.waitForResponse(r=>r.url().includes('/api/ecosystem/relationships?')&&r.url().includes('q=TEDCO'));await page.locator('#network-table tbody tr').first().waitFor()
    assert.match(await page.locator('#network-table').innerText(),/TEDCO/i)
   }
  }
  for(const route of ['','/3d','/4d']){
   await page.goto(origin+'/__ecosystem-query-fixture?view=graph'+route.replace('/',''),{waitUntil:'domcontentloaded',timeout:120000});await page.waitForFunction(()=>document.querySelector('#network-labels')?.children.length>0,{},{timeout:60000})
   assert(await page.locator('#network-labels button').count()<=250)
   assert.match(await page.locator('#network-data-status').innerText(),/community markers/)
   if(route===''){
    await page.locator('[data-panel=search]').click()
    await page.locator('#network-search').fill('TEDCO');await page.locator('#network-results button').first().waitFor()
    await page.locator('#network-results button').first().click();await page.waitForFunction(()=>document.querySelector('#network-data-status')?.textContent.includes('Financial summaries use the full snapshot'))
    assert(await page.locator('#network-labels button').count()<=250)
    await page.locator('#network-analysis-mode').evaluate(el=>{el.value='geography';el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('input',{bubbles:true}))})
    await page.waitForResponse(r=>r.url().includes('/api/ecosystem/graph?')&&r.url().includes('mode=geography'));await page.waitForFunction(()=>document.querySelector('#network-data-status')?.textContent.includes('county aggregate markers'));await page.waitForFunction(()=>document.querySelector('#network-labels')?.children.length>0)
   }
   await page.waitForTimeout(200);await page.waitForFunction(()=>document.querySelector('#network-labels')?.children.length>0);receipt.push({viewport,route:'graph'+route,nodes:await page.locator('#network-labels button').count()})
  }
  assert(!requests.some(url=>/ecosystem-(?:portal|history|relationships|nonprofits|performance)\.json/.test(url)),'views must not fetch full evidence files')
  console.log(JSON.stringify({viewport,checks:receipt.filter(r=>r.viewport===viewport),errors}));assert.deepEqual(errors,[])
  await page.close()
 }
 await mkdir(new URL('../../artifacts/ecosystem-query/',import.meta.url),{recursive:true})
 await writeFile(new URL('../../artifacts/ecosystem-query/browser.json',import.meta.url),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt))
}finally{await browser.close()}
