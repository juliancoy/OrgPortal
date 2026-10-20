import {chromium} from '@playwright/test'
const origin=process.env.MAP_ORIGIN||'http://127.0.0.1:5201'
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader']})
try{
 const page=await browser.newPage({viewport:{width:1360,height:900},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/api/org/api/network/**',r=>r.fulfill({status:503,body:'Bundled public evidence'}))
 await page.route('**/__benchmark-fixture*',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><body><div id="root" class="portal-ecosystem eco-page"></div><script type="module">import markup from '/src/features/ecosystem/markup.html?raw';import '/src/features/ecosystem/network.css';import {mountEcosystemNetworkGPU} from '/src/features/ecosystem/network-webgpu.js';const root=document.querySelector('#root');root.innerHTML=markup;window.cleanup=mountEcosystemNetworkGPU(root,{renderer:'canvas',dataUrl:'/ecosystem-data/ecosystem-portal.json',historyUrl:'/ecosystem-data/ecosystem-relationships.json',apiPrefix:'/api/org/api/network',portalPath:p=>p});</script></body></html>`}))
 await page.goto(origin+'/__benchmark-fixture',{waitUntil:'domcontentloaded'})
 await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links'),null,{timeout:60000})
 const session=await page.context().newCDPSession(page);await session.send('HeapProfiler.collectGarbage')
 const result=await page.evaluate(async()=>{
  const times=[],start=performance.now();let last=start
  for(let i=0;i<10;i++)await new Promise(resolve=>requestAnimationFrame(now=>{times.push(now-last);last=now;resolve()}))
  times.sort((a,b)=>a-b)
  const begin=performance.now();document.querySelector('#zoom-in').click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
  return {status:document.querySelector('#network-status').textContent,frameMedianMs:times[5],frameMaxMs:times[9],zoomToTwoFramesMs:performance.now()-begin,heapBytesAfterGC:performance.memory?.usedJSHeapSize??null,sampleDurationMs:last-start}
 })
 console.log(JSON.stringify({origin,...result,errors}))
 if(errors.length)process.exitCode=1
}finally{await browser.close()}
