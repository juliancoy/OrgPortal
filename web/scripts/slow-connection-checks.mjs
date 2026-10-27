import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium,expect} from '@playwright/test'
import {fixtureServer} from './fixture-server.mjs'

// Real HTTP throttling includes scripts, CSS, images and APIs. Fulfilling
// intercepted requests would bypass network transfer and bandwidth emulation.
export const slowConnectionProfile={name:'slow-4g',latency:150,downloadThroughput:1_600_000/8,uploadThroughput:750_000/8,offline:false,connectionType:'cellular4g'}
const firstContentBudgetMs=15000
export async function testSlowConnection(root,output){
 await mkdir(join(output,'slow-connection'),{recursive:true})
 const orgs=Array.from({length:501},(_,n)=>({id:`slow-org-${n}`,slug:`slow-org-${n}`,name:`Network Org ${n}`,description:'Synthetic directory entry for network regression checks.',membership_count:n===500?1000:1,upcoming_events_count:0,pending_challenges_count:0,is_disputed:false,links:[]}))
 const event={id:'slow-event',slug:'slow-workshop',title:'Slow Network Workshop',starts_at:'2099-01-24T18:00:00Z',ends_at:'2099-01-24T20:00:00Z',description:'Synthetic event for network regression checks.',location:'Baltimore',links:[],media:[],venues:[]}
 let directoryRequests=0,secondPageFinished=false,failEvents=false
 const probe=randomBytes(96*1024).toString('base64')
 const {server,base}=await fixtureServer(root,output,0,{minify:true,compress:true,cacheAssets:true,localOnly:true,apiResponse:async url=>{
  const path=url.pathname
  if(path==='/api/slow-connection-probe')return {json:{probe}}
  if(path==='/api/org/api/network/orgs/public'){
   directoryRequests++;const offset=Number(url.searchParams.get('offset')||0)
   if(offset){await new Promise(resolve=>setTimeout(resolve,2000));secondPageFinished=true}
   return {json:orgs.slice(offset,offset+500)}
  }
  if(path==='/api/org/api/network/orgs/public/slow-org-0')return {json:orgs[0]}
  if(path.endsWith('/branding'))return {json:{portal:null}}
  if(path==='/api/org/api/network/events/public')return {json:failEvents?{error:'Fixture unavailable'}:[event],status:failEvents?503:200}
  if(path==='/api/org/api/network/events/public/slow-workshop')return {json:event}
  if(path.endsWith('/attendance'))return {json:{event_id:event.id,count:0,registered:false,attendees:[]}}
  if(path.endsWith('/company-votes/public'))return {json:{available:false,closed:false,companies:[]}}
  if(path.endsWith('/chat'))return {json:{enabled:false}}
 }})
 const browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||existsSync('/usr/bin/google-chrome')?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/google-chrome'}:{})})
 const results=[]
 try{
  for(const scenario of [
   {name:'organizations',path:'/orgs',ready:'.organization-directory-card'},
   {name:'organization',path:'/orgs/slow-org-0',ready:'.organization-profile h1'},
   {name:'events',path:'/events',ready:'.public-event-list-body h2'},
   {name:'event',path:'/events/slow-workshop',ready:'.public-event-main h1'},
  ]){
   const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})
   // Routing disables the HTTP cache, so leave real local requests untouched.
   // CSP and blocked external DNS keep this disposable context isolated.
   const remoteRequests=[]
   context.on('request',request=>{if(!request.url().startsWith(base+'/'))remoteRequests.push(request.url())})
   const page=await context.newPage(),errors=[]
   page.on('pageerror',error=>errors.push(error.message))
   await page.addInitScript(()=>{
    window.__loadMetrics={observedLcpMs:null,observedCls:0}
    new PerformanceObserver(list=>{for(const entry of list.getEntries())window.__loadMetrics.observedLcpMs=entry.startTime}).observe({type:'largest-contentful-paint',buffered:true})
    new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.__loadMetrics.observedCls+=entry.value}).observe({type:'layout-shift',buffered:true})
   })
   const cdp=await context.newCDPSession(page)
   await cdp.send('Network.enable')
   const {name,...conditions}=slowConnectionProfile
   await cdp.send('Network.emulateNetworkConditions',conditions)
   // Prove emulation delays a non-cacheable HTTP transfer, rather than relying
   // on a profile label or navigator.connection.
   if(scenario.name==='organizations'){
    await page.goto(base+'/api/slow-connection-probe',{waitUntil:'domcontentloaded',timeout:60000})
    const elapsed=await page.evaluate(async()=>{const start=performance.now();await(await fetch('/api/slow-connection-probe',{cache:'no-store'})).json();return performance.now()-start})
    assert(elapsed>=400,`Network emulation ineffective: 96KiB probe took ${elapsed}ms`)
    results.push({name:'network-probe',elapsedMs:Math.round(elapsed),minimumMs:400})
   }
   for(const visit of ['cold','warm']){
    const beforeRequests=directoryRequests
    await page.goto(base+scenario.path+'?viewer=visitor',{waitUntil:'domcontentloaded',timeout:60000})
    await page.locator(scenario.ready).first().waitFor({timeout:45000})
    const firstContentMs=await page.evaluate(()=>performance.now())
    assert(firstContentMs<firstContentBudgetMs,`${scenario.name} ${visit}: first content exceeded ${firstContentBudgetMs}ms fixture budget`)
    if(scenario.name==='organizations'){
     if(visit==='cold')assert.equal(secondPageFinished,false,'Directory blocked its first render on the second page')
     await page.getByRole('link',{name:'Network Org 500',exact:true}).waitFor({timeout:15000})
     if(visit==='warm')assert.equal(directoryRequests,beforeRequests,'Fresh directory cache unexpectedly fetched HTTP data')
    }
    const completeMs=await page.evaluate(()=>performance.now())
    const metrics=await page.evaluate(()=>({firstPaintMs:performance.getEntriesByName('first-contentful-paint')[0]?.startTime??null,...window.__loadMetrics,resources:performance.getEntriesByType('resource').map(entry=>({url:new URL(entry.name).pathname+new URL(entry.name).search,initiator:entry.initiatorType,startMs:entry.startTime,durationMs:entry.duration,transferBytes:entry.transferSize,encodedBytes:entry.encodedBodySize}))}))
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Page overflows mobile viewport')
    results.push({name:scenario.name,visit,profile:name,firstContentMs:Math.round(firstContentMs),completeMs:Math.round(completeMs),...metrics})
    await page.screenshot({path:join(output,'slow-connection',`${scenario.name}-${visit}.png`)})
    console.log(`[slow-network] ${scenario.name} ${visit}: first content ${Math.round(firstContentMs)}ms`)
   }
   if(scenario.name==='events'){
    failEvents=true
    await page.reload({waitUntil:'domcontentloaded'})
    await expect(page.getByText('Fixture unavailable',{exact:false})).toBeVisible({timeout:15000})
    await expect(page.locator(scenario.ready)).toHaveCount(0)
    failEvents=false
   }
   assert.deepEqual(errors,[],`${scenario.name}: uncaught browser errors`)
   assert.deepEqual(remoteRequests,[],`${scenario.name}: unexpected remote requests`)
   await context.close()
  }
 }finally{
  await browser.close()
  server.closeAllConnections()
  await new Promise(resolve=>server.close(resolve))
  await writeFile(join(output,'slow-connection.json'),JSON.stringify({profile:slowConnectionProfile,environment:'Synthetic minified gzip fixture bundle; regression timings are not production Core Web Vitals',firstContentBudgetMs,results},null,2))
 }
 return results
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await testSlowConnection(resolve(fileURLToPath(new URL('..',import.meta.url))),resolve(process.argv[2]||'../artifacts/slow-connection'))
