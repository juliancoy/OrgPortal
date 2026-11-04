import {browserLaunch} from './browser-launch.mjs'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {queryEcosystem} from '../server/ecosystem-query.mjs'
import {directionFixture} from './graph-direction-fixture.mjs'
const server=await createServer({configFile:false,root:new URL('..',import.meta.url).pathname,cacheDir:'/tmp/orgportal-parent-check',plugins:[react()],optimizeDeps:{include:['react','react-dom/client','react-router-dom','d3-force','d3-force-3d']},define:{__APP_VERSION__:JSON.stringify('test'),__APP_BUILD_NUMBER__:1},server:{host:'127.0.0.1',port:5199,strictPort:true}})
await server.listen()
const browser=await chromium.launch(browserLaunch({args:['--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--enable-unsafe-swiftshader']}))
const fixture=directionFixture()
try{
 for(const view of process.argv.length>2?process.argv.slice(2):['graph','graph3d','graph4d']){
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  // Exercise the supported WebGL2 fallback: this Docker host loses its software WebGPU device during scope changes.
  if(view!=='graph'&&!process.env.GRAPH_PARENT_NATIVE_GPU)await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined}))
  await page.route('**/__ecosystem-query-fixture*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div><script type="module">import {injectIntoGlobalHook} from "/@react-refresh";injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;</script><script type="module" src="/scripts/ecosystem-query-fixture.tsx"></script></body></html>'}))
  await page.route('**/api/ecosystem/**',async r=>{const url=new URL(r.request().url());await r.fulfill({json:url.pathname.endsWith('/graph')?(await queryEcosystem(fixture.read,'graph',url.searchParams)).body:{records:fixture.organizations,total:fixture.organizations.length}})})
  await page.route('**/pidp/**',r=>r.fulfill({status:401,json:{}}))
  await page.goto('http://127.0.0.1:5199/__ecosystem-query-fixture?view='+view+'&org=b')
  const selected=()=>page.locator('#network-labels button[aria-pressed="true"]')
  const names=()=>page.locator('#network-labels button').allTextContents().then(values=>values.sort())
  const waitNames=expected=>page.waitForFunction(expected=>JSON.stringify([...document.querySelectorAll('#network-labels button')].map(el=>el.textContent).sort())===JSON.stringify(expected),[...expected].sort())
  const waitDirection=direction=>page.waitForFunction(direction=>document.querySelector('#network-data-status')?.textContent.startsWith(direction==='parents'?'Parents (':'Children ('),direction)
  await selected().waitFor({timeout:60000});await waitDirection('children')
  // Show all labels so parents can be exercised with real pointer clicks.
  await page.locator('#network-label-mode').evaluate(el=>{el.value='all';el.dispatchEvent(new Event('change',{bubbles:true}))})
  await page.locator('#neighbors').evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}))})
  assert.deepEqual(await names(),['Beta','Gamma 0'])
  await selected().click();await waitDirection('parents')
  assert.deepEqual(await names(),['Alpha','Beta','Delta'])
  assert.equal(new URL(page.url()).searchParams.get('direction'),'parents')
  await page.locator('#network-labels button').filter({hasText:'Alpha'}).click()
  await page.waitForFunction(()=>document.querySelector('#network-labels button[aria-pressed="true"]')?.textContent==='Alpha')
  await waitDirection('children');await waitNames(['Alpha','Beta'])
  assert.equal(new URL(page.url()).searchParams.get('org'),'a')
  assert.equal(new URL(page.url()).searchParams.get('direction'),'children')
  assert.equal(new URL(page.url()).searchParams.get('include'),'b')
  for(const href of await page.locator('[data-graph-type]').evaluateAll(links=>links.map(link=>link.href))){assert.equal(new URL(href).searchParams.get('org'),'a');assert.equal(new URL(href).searchParams.get('direction'),'children')}
  const centered=()=>page.waitForFunction(()=>{const label=document.querySelector('#network-labels button[aria-pressed="true"]'),host=document.querySelector('#network-labels');return label&&host&&Math.abs(parseFloat(label.style.left)-host.clientWidth/2)<2&&Math.abs(parseFloat(label.style.top)-host.clientHeight/2)<2})
  assert.equal(await page.locator('#network-navigation-mode').inputValue(),'centered');await centered()
  await page.locator('#network-navigation-mode').evaluate(el=>{el.value='free';el.dispatchEvent(new Event('input',{bubbles:true}))})
  assert.equal(await page.locator('#network-navigation-mode').inputValue(),'free')
  await page.locator('#network-canvas canvas').focus()
  await page.keyboard.down('d')
  await page.waitForFunction(()=>{const label=document.querySelector('#network-labels button[aria-pressed="true"]'),host=document.querySelector('#network-labels');return Math.abs(parseFloat(label.style.left)-host.clientWidth/2)>8})
  await page.keyboard.up('d')
  await page.locator('#network-navigation-mode').evaluate(el=>{el.value='centered';el.dispatchEvent(new Event('input',{bubbles:true}))});await centered()
  await selected().click();await waitDirection('parents')
  await waitNames(['Alpha','Epsilon']);await centered()
  await selected().press('Enter');await waitDirection('children');await waitNames(['Alpha','Beta'])
  await selected().click();await waitDirection('parents');await waitNames(['Alpha','Epsilon'])
  await page.locator('#network-labels button').filter({hasText:'Epsilon'}).click()
  await waitDirection('children');await waitNames(['Alpha','Epsilon']);await centered()
  assert.equal(new URL(page.url()).searchParams.get('org'),'e')
  await selected().click();await waitDirection('parents');await waitNames(['Epsilon'])
  await page.reload();await selected().waitFor({timeout:60000});await waitDirection('parents')
  await waitNames(['Epsilon']);assert.deepEqual(await names(),['Epsilon'])
  assert.deepEqual(errors,[]);console.log(view+': parents/children toggle, clickable parents, keyboard toggle and empty-parent selection passed')
  await page.close()
 }
}catch(error){for(const context of browser.contexts())for(const page of context.pages())console.log(await page.evaluate(()=>({url:location.href,status:document.querySelector('#network-status')?.textContent,selected:document.querySelector('#network-labels button[aria-pressed="true"]')?.outerHTML,canvas:document.querySelector('#network-canvas')?.getBoundingClientRect().toJSON()})));throw error}finally{await browser.close();await server.close()}
