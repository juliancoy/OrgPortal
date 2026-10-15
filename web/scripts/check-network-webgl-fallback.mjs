import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
const baseUrl=process.env.ECOSYSTEM_TEST_URL || 'http://127.0.0.1:5179'
const snapshot={organizations:['One','Two','Three'].map((name,i)=>({id:String(i),name,category:'company',type:'Company',publicEmails:[],sourceRows:[]})),relationships:[{id:'edge',source:'0',target:'1',kind:'affiliation',relationship:'affiliation',type:'Fixture',sourceLabel:'One',targetLabel:'Two',provenance:{sheet:'Fixture'}}],financing:[]}
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
try {
 for(const mode of ['missing','no-adapter']) {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
  await context.addInitScript(mode=>Object.defineProperty(navigator,'gpu',{value:mode==='missing'?undefined:{requestAdapter:async()=>null}}),mode)
  await context.route('**/ecosystem-data/ecosystem-*.json',r=>r.fulfill({json:r.request().url().endsWith('ecosystem-portal.json')?snapshot:{organizations:[],relationships:[],financing:[]}}))
  await context.route('**/api/org/api/network/**',r=>r.fulfill({status:503,body:'Fixture'}))
  await context.route('**/pidp/**',r=>r.fulfill({status:401,body:'{}'}))
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  for(const dimension of ['3d','4d']) {
   await page.goto(`${baseUrl}/ecosystem/network/${dimension}`,{waitUntil:'domcontentloaded'})
   await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links'),null,{timeout:60000})
   assert.equal(await page.locator('canvas').getAttribute('data-backend'),'webgl2')
   await page.waitForFunction(()=>document.querySelectorAll('#network-labels button:not([hidden])').length>0)
   const positions=()=>page.locator('#network-labels button').evaluateAll(ns=>ns.map(n=>[n.style.left,n.style.top]))
   const before=await positions(),box=await page.locator('canvas').boundingBox()
   await page.mouse.move(box.x+25,box.y+25);await page.mouse.down();await page.mouse.move(box.x+160,box.y+95,{steps:8});await page.mouse.up()
   await page.waitForFunction(before=>JSON.stringify([...document.querySelectorAll('#network-labels button')].map(n=>[n.style.left,n.style.top]))!==JSON.stringify(before),before)
   console.log(`${mode}: ${dimension} renders and orbits through WebGL 2`)
  }
  assert.deepEqual(errors,[])
  await context.close()
 }
} finally {await browser.close()}
