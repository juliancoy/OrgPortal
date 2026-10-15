import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
const base={organizations:['Source','Small','Large'].map((name,i)=>({id:`sizing-${i}`,name,type:'Company',category:'company',publicEmails:[],sourceRows:[]})),relationships:[100,900].map((amount,i)=>({id:`award-${i}`,source:'sizing-0',target:`sizing-${i+1}`,sourceLabel:'Source',targetLabel:i?'Large':'Small',kind:'transfer',relationship:'funding',type:'Fixture funding',currency:'USD',amount,sourceUrl:`https://example.test/${i}`,provenance:{sheet:'Synthetic fixture'}})),financing:[]}
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader']})
try{
 const receipts=[]
 for(const mode of ['canvas','webgpu']){
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(()=>{window.sizeGraphs=[];const send=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message,...rest){if(message?.type==='graph')window.sizeGraphs.push(message.nodes.map(n=>({id:n.id,radius:n.renderRadius})));return send.call(this,message,...rest)}})
  await page.route('**/ecosystem-data/ecosystem-*.json',r=>r.fulfill({json:r.request().url().endsWith('ecosystem-portal.json')?base:{organizations:[],relationships:[],financing:[]}}))
  await page.route('**/api/org/api/network/**',r=>r.fulfill({status:503,body:'Synthetic read-only sizing fixture'}))
  await page.goto('http://127.0.0.1:5187/ecosystem/network'+(mode==='webgpu'?'/webgpu':''));await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links'))
  await page.locator('[data-panel=controls]').click()
  const latest=()=>page.evaluate(()=>window.sizeGraphs.at(-1)),small=async()=>(await latest()).find(n=>n.id==='sizing-1').radius
  const log=await small();assert.equal(await page.locator('#node-size-algorithm').inputValue(),'log')
  await page.locator('#node-size-algorithm').selectOption('linear');const linear=await small();assert(Math.abs(linear-8.4)<1e-10)
  await page.locator('#node-size-algorithm').selectOption('exp');const exp=await small();assert(exp<linear)
  await page.locator('#node-size-algorithm').selectOption('power')
  await page.locator('#node-size-alpha').evaluate(el=>{el.value='2';el.dispatchEvent(new Event('input'))});const power=await small();assert(Math.abs(power-6.24)<1e-10)
  assert.equal(await page.locator('#node-size-alpha-value').textContent(),'2.0')
  assert(log>linear&&linear>exp&&exp>power)
  await page.locator('#scale-node-finances').uncheck();assert((await latest()).every(n=>n.radius===6))
  await page.locator('#network-reset').click();assert.equal(await page.locator('#node-size-algorithm').inputValue(),'log');assert.equal(await page.locator('#node-size-alpha').inputValue(),'1');assert.equal(await page.locator('#live-physics').isChecked(),false)
  assert.equal(await small(),log)
  await page.setViewportSize({width:390,height:844});await page.locator('[data-panel=controls]').click();await page.locator('#node-size-alpha').scrollIntoViewIfNeeded();assert(await page.locator('#node-size-alpha').isVisible())
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  assert.deepEqual(errors,[]);receipts.push({mode,log,linear,exp,power,uniform:true,reset:true,mobile:true,errors});await page.close()
 }
 await mkdir('../artifacts/node-sizing',{recursive:true});await writeFile('../artifacts/node-sizing/browser-check.json',JSON.stringify(receipts,null,2)+'\n');console.log(JSON.stringify(receipts))
}finally{await browser.close()}
