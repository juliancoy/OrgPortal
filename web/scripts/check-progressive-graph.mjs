import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
const server=await createServer({configFile:false,root:new URL('..',import.meta.url).pathname,cacheDir:'/tmp/orgportal-progressive-check',plugins:[react()],define:{__APP_VERSION__:JSON.stringify('test'),__APP_BUILD_NUMBER__:1},server:{host:'127.0.0.1',port:5198,strictPort:true}})
await server.listen()
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan']})
try{
 for(const view of ['graph','graph3d','graph4d']){
  const page=await browser.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(()=>{window.layoutWorkers=0;const Original=window.Worker;window.Worker=class extends Original{constructor(url,options){super(url,options);if(String(url).includes('network-layout'))window.layoutWorkers++}};window.graphCounts=[];new MutationObserver(()=>{const n=document.querySelector('#network-labels')?.children.length;if(n)window.graphCounts.push(n)}).observe(document,{childList:true,subtree:true})})
  await page.route('**/__ecosystem-query-fixture*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div><script type="module">import {injectIntoGlobalHook} from "/@react-refresh";injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;</script><script type="module" src="/scripts/ecosystem-query-fixture.tsx"></script></body></html>'}))
  await page.route('**/api/ecosystem/**',r=>{
   if(!r.request().url().includes('/graph?'))return r.fulfill({json:{organizations:[],results:[]}})
   const organizations=Array.from({length:120},(_,i)=>({id:'node-'+i,name:'Organization '+i,category:'company',serverCommunity:true,networkMetrics:{}}))
   return r.fulfill({json:{version:'fixture-v1',generatedAt:new Date().toISOString(),organizations,relationships:[],groups:{},offset:0,nextOffset:null,total:120,totalOrganizations:5000,matchingEdges:0,communityOverview:true}})
  })
  await page.route('**/pidp/**',r=>r.fulfill({status:401,json:{}}))
  await page.goto('http://127.0.0.1:5198/__ecosystem-query-fixture?view='+view)
  await page.waitForFunction(()=>document.querySelector('#network-labels')?.children.length===120,{},{timeout:60000})
  await page.waitForTimeout(300)
  const result=await page.evaluate(()=>({workers:window.layoutWorkers,counts:window.graphCounts}))
  assert.equal(result.workers,1);assert(result.counts.some(n=>n>0&&n<120));assert.deepEqual(errors,[])
  console.log(view,JSON.stringify({workers:result.workers,batches:[...new Set(result.counts)]}));await page.close()
 }
}finally{await browser.close();await server.close()}
