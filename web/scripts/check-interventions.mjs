import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
const base={id:'11111111-1111-4111-8111-111111111111',organizationId:'fixture-org',organizationName:'Fixture steward organization',revision:1,title:'Fixture permit processing pilot',outcome:'Reduce median processing time in a measured pilot.',metric:'Median processing time',unit:'days',baseline:60,target:30,current:45,measurementDate:'2026-10-14',baselineDate:'2026-01-01',targetDate:'2027-01-01',authorityReferenceId:'',authority:'Fixture responsible institution',authoritySourceUrl:'https://example.test/authority',instrument:'administrative',decisionDate:'2000-01-01',nextAction:'Request and publish the baseline dataset.',actionDueDate:'2027-01-01',constraints:'Confirm the dataset covers comparable applications.',facts:'Synthetic browser test evidence.',factSourceUrl:'https://example.test/baseline',hypothesis:'A smaller pilot may reveal avoidable delays.',evidenceStatus:'reviewed',status:'active',authorizationUrl:'https://example.test/steward-approval',result:'',resultSourceUrl:'',updatedAt:'2026-10-14T12:00:00Z'}
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']})
try{
 const page=await browser.newPage(),errors=[],writes=[];let unavailable=false
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;if(!path.startsWith('/api/'))return route.continue()
  if(route.request().method()!=='GET')writes.push(path)
  if(path.includes('/initiatives/public'))return route.fulfill({status:unavailable?503:200,contentType:'application/json',body:JSON.stringify({records:[base,{...base,id:'22222222-2222-4222-8222-222222222222',title:'Fixture evidence request',status:'proposed',decisionDate:'',baseline:null,target:null,current:null}],nextOffset:null})})
  return route.fulfill({status:401,contentType:'application/json',body:'{}'})
 })
 await page.route('**/pidp/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{}'}))
 await mkdir('../artifacts/interventions',{recursive:true});const receipts=[]
 for(const [width,height] of [[1440,1000],[390,844]]){
  await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:5187/ecosystem/network/interventions',{waitUntil:'domcontentloaded'})
  await page.waitForSelector('.intervention-card',{timeout:30000})
  assert.equal(await page.locator('.intervention-card').count(),2)
  assert.equal(await page.locator('progress').getAttribute('value'),'50')
  await page.getByLabel('Work status').selectOption('overdue');assert.equal(await page.locator('.intervention-card').count(),1)
  await page.getByLabel('Work status').selectOption('all');await page.getByRole('button',{name:'Plan an initiative'}).click()
  await page.getByLabel('Initiative title',{exact:true}).fill('Unsaved local outline')
  assert(await page.getByRole('button',{name:'Review public changes'}).isDisabled())
  await page.getByRole('button',{name:'Close editor'}).click()
  const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight}))
  assert(dimensions.scrollWidth<=width+1);assert(dimensions.scrollHeight<=height+1)
  await page.screenshot({path:`../artifacts/interventions/dashboard-${width}.png`})
  receipts.push({width,height,dimensions})
 }
 unavailable=true;await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('alert').waitFor()
 assert.match(await page.getByRole('alert').innerText(),/could not be loaded/)
 assert.equal(await page.locator('.intervention-metrics strong').first().innerText(),'—')
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[])
 await writeFile('../artifacts/interventions/browser-check.json',JSON.stringify({receipts,errors,writes},null,2)+'\n')
 console.log(JSON.stringify({receipts,errors,writes,checked:'Public dashboard, overdue filters, measured progress, anonymous draft, service failure'}))
}finally{await browser.close()}
