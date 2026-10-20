import {chromium} from '@playwright/test'
import assert from 'node:assert/strict'
const renderer=process.env.NETWORK_RENDERER||'canvas'
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader']})
try{
 const page=await browser.newPage({viewport:{width:1360,height:900}}),errors=[]
 page.on('pageerror',e=>{errors.push(e.message);console.log('pageerror',e.stack)})
 await page.route('**/api/org/api/network/**',r=>r.fulfill({status:503,body:'offline fixture'}))
 await page.route('**/__overhaul-fixture*',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><body><div id="root" class="portal-ecosystem eco-page"></div><script type="module">
 import markup from '/src/features/ecosystem/markup.html?raw';import '/src/features/ecosystem/network.css';import {mountEcosystemNetworkGPU} from '/src/features/ecosystem/network-webgpu.js';const root=document.querySelector('#root');root.innerHTML=markup;if('${renderer}'==='webgpu4d'){const {networkNDControls}=await import('/src/features/ecosystem/nd-controls.js');root.querySelector('.eco-network-controls').insertAdjacentHTML('afterbegin',networkNDControls())}window.cleanup=mountEcosystemNetworkGPU(root,{renderer:'${renderer}',dataUrl:'/ecosystem-data/ecosystem-portal.json',historyUrl:'/ecosystem-data/ecosystem-relationships.json',apiPrefix:'/api/org/api/network',portalPath:p=>p});</script></body></html>`}))
 await page.goto((process.env.MAP_ORIGIN||'http://127.0.0.1:5201')+'/__overhaul-fixture',{waitUntil:'domcontentloaded'})
 await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links'),null,{timeout:60000}).catch(async e=>{console.log((await page.locator('body').innerText()).slice(0,2500));throw e})
 if(renderer==='webgpu4d')await page.locator('#network-dimensions').evaluate(el=>{el.value='6';el.dispatchEvent(new Event('change',{bubbles:true}))})
 console.log('ready',await page.locator('#network-status').textContent())
 await page.locator('#live-physics').evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change'))})
 await page.locator('[data-panel=controls]').click();await page.locator('[data-panel=controls]').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('[data-panel=controls]').getAttribute('aria-selected'),'true')
 const interactionTimes=[]
 const set=async(id,value)=>{interactionTimes.push(await page.locator('#'+id).evaluate((el,value)=>{const start=performance.now();el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));return performance.now()-start},value));await page.waitForTimeout(150)}
 const sample=async()=>page.evaluate(async()=>{const samples=[];let last=performance.now();for(let i=0;i<10;i++)await new Promise(resolve=>requestAnimationFrame(now=>{samples.push(now-last);last=now;resolve()}));samples.sort((a,b)=>a-b);return {frameMedianMs:samples[5],frameP95Ms:samples[9],heapBytes:performance.memory?.usedJSHeapSize??null}})
 assert.equal(await page.locator('#network-flow-filters').isVisible(),false);console.log('stage all');await set('network-detail-mode','all');const allTiming=await sample();const all=await page.locator('#network-status').textContent()
 await set('network-detail-mode','overview');const overviewTiming=await sample();const overview=await page.locator('#network-status').textContent();assert.ok(Number(all.match(/· (\d+) visible links/)[1])>Number(overview.match(/· (\d+) visible links/)[1]))
 await page.locator('#network-results button').first().evaluate(el=>el.click())
 assert.equal(await page.locator('#network-detail-mode').inputValue(),'focus');assert.match(await page.locator('#network-detail').textContent(),/Organization records/)
 await set('network-hop-depth','3');await set('network-size-metric','incoming');if(renderer!=='canvas'){await set('network-camera-mode','orthographic');await set('network-camera-mode','perspective')}await set('network-edge-encoding','type');await set('network-label-mode','hover')
 assert.ok(await page.locator('#network-labels button[aria-pressed=true]').isVisible());await set('network-theme','dark');assert.equal(await page.locator('.portal-ecosystem').getAttribute('data-network-theme'),'dark')
 await page.waitForTimeout(1000);await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links'));assert.ok(new URL(page.url()).searchParams.has('org'));assert.match(await page.locator('#network-detail').textContent(),/Organization records/);await set('network-analysis-mode','funding');assert.match(await page.locator('#network-analysis-legend').textContent(),/payment/)
 await set('network-analysis-mode','geography');assert.match(await page.locator('#network-analysis-legend').textContent(),/Published Maryland coordinates/)
 await set('network-analysis-mode','network');await set('network-label-mode','priority')
 await page.locator('#network-clear-selection').evaluate(el=>el.click());await set('network-detail-mode','overview');await page.locator('#network-community-list button').first().evaluate(el=>el.click());await page.waitForTimeout(200);assert.notEqual(await page.locator('#network-expanded-communities').inputValue(),'[]')
 assert.match(new URL(page.url()).search,/network-theme/)
 console.log('stage reload');await page.waitForTimeout(1000);await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links'))
 assert.equal(await page.locator('#network-theme').inputValue(),'dark');assert.equal(await page.locator('#network-hop-depth').inputValue(),'3');assert.notEqual(await page.locator('#network-expanded-communities').inputValue(),'[]');assert.equal(await page.locator('#network-community-list button').first().getAttribute('aria-expanded'),'true')
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 await page.locator('[data-panel=controls]').click();await page.screenshot({path:'/tmp/orgportal-network-overhaul-mobile.png'});assert.deepEqual(errors,[])
 console.log(JSON.stringify({renderer,maxInputHandlerMs:Math.max(...interactionTimes),allTiming,overviewTiming,all,overview,controls:true,selection:true,persistence:true,mobile:true,errors}))
}finally{await browser.close()}
