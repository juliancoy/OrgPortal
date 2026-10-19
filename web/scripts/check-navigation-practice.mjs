import {chromium} from '@playwright/test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {PNG} from 'pngjs'
const artifacts=new URL('../../artifacts/4d-navigation-practice/',import.meta.url).pathname
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader']})
try{
const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});const errors=[];let documents=0,snapshots=0;page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});if(!process.env.PRACTICE_WEBGPU)await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined}));
const base={organizations:['Alpha','Beta'].map((name,i)=>({id:'fixture-'+i,name,category:'company',type:'Company',publicEmails:[],sourceRows:[]})),relationships:[{id:'award',source:'fixture-0',target:'fixture-1',kind:'transfer',relationship:'funding',amount:100,currency:'USD'}],financing:[]};
await page.route('**/ecosystem/network*',r=>{if(r.request().resourceType()!=='document')return r.continue();documents++;return r.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0"><div id="root"></div></body>'})});await page.route('**/ecosystem-data/ecosystem-*.json',r=>{snapshots++;return r.fulfill({json:r.request().url().endsWith('ecosystem-portal.json')?base:{organizations:[],relationships:[],financing:[]}})});await page.route('**/api/org/api/network/**',r=>r.fulfill({status:503,body:'Read-only fixture'}));await page.goto((process.env.MAP_ORIGIN||'http://127.0.0.1:5187')+'/ecosystem/network?panel=visualization');
await page.evaluate(async()=>{
const RefreshRuntime=(await import('/@react-refresh')).default;RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
const source=await fetch('/src/ui/views/EcosystemNetworkPage.tsx').then(r=>r.text()),routerUrl=source.match(/from ["']([^"']*react-router-dom[^"']*)["']/)[1];
const React=(await import(routerUrl.replace('react-router-dom.js','react.js'))).default,ReactDOM=(await import(routerUrl.replace('react-router-dom.js','react-dom_client.js'))).default,{BrowserRouter,Routes,Route}=await import(routerUrl),{EcosystemNetworkPage}=await import('/src/ui/views/EcosystemNetworkPage.tsx');window.marker='same document';window.root=ReactDOM.createRoot(document.querySelector('#root'));root.render(React.createElement(BrowserRouter,null,React.createElement(Routes,null,...[['','canvas'],['/3d','webgpu3d'],['/4d','webgpu4d'],['/webgpu','webgpu']].map(([path,renderer])=>React.createElement(Route,{key:path,path:'/ecosystem/network'+path,element:React.createElement(EcosystemNetworkPage,{renderer})})))));
});
await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links'),null,{timeout:12000}).catch(async e=>{console.log('BODY',await page.locator('body').innerText());throw e});await page.evaluate(()=>window.originalHost=document.querySelector('.eco-page'));
await page.getByRole('tab',{name:'Search',exact:true}).click();await page.locator('#network-search').fill('Alpha');await page.locator('#link-width').evaluate(n=>{n.value='2';n.dispatchEvent(new Event('input',{bubbles:true}))});await page.locator('#network-results button').first().click();await page.locator('#network-canvas [data-eco-fullscreen]').click();await page.waitForFunction(()=>document.fullscreenElement===originalHost);

const snapshotCount=snapshots;await page.getByRole('tab',{name:'Visualization',exact:true}).click();await page.getByRole('button',{name:'4D navigation practice',exact:true}).click();await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.renderer==='practice4d');await page.waitForTimeout(500);
assert.equal(await page.locator('canvas').getAttribute('data-backend'),process.env.PRACTICE_WEBGPU?'webgpu':'webgl2');assert(await page.getByRole('heading',{name:'Navigation practice',exact:true}).isVisible());assert.equal(await page.evaluate(()=>window.marker),'same document');assert(await page.evaluate(()=>document.fullscreenElement===originalHost));assert.equal(snapshots,snapshotCount);assert.equal(await page.locator('.eco-practice-labels span').count(),18);
const coordinate=axis=>page.locator(`[data-coordinate="${axis}"]`).innerText();const initial=await Promise.all(['X','Y','Z','W'].map(coordinate));assert.equal(initial[3],'0.0');
await page.locator('canvas').focus();await page.keyboard.down('e');await page.waitForFunction(()=>Number(document.querySelector('[data-coordinate="W"]').textContent)>4);await page.keyboard.up('e');const advanced=Number(await coordinate('W'));assert(advanced>0);await page.keyboard.down('q');await page.waitForFunction(w=>Number(document.querySelector('[data-coordinate="W"]').textContent)<w,advanced);await page.keyboard.up('q');
const x=await coordinate('X');await page.keyboard.down('a');await page.waitForFunction(x=>document.querySelector('[data-coordinate="X"]').textContent!==x,x);await page.keyboard.up('a');
await page.getByRole('button',{name:'Reset position',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-coordinate="W"]').textContent==='0.0');assert.deepEqual(await Promise.all(['X','Y','Z','W'].map(coordinate)),initial);
await page.getByRole('button',{name:'+ (E)',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-coordinate="W"]').textContent==='50.0');await page.keyboard.press('e');await page.waitForTimeout(100);assert.equal(await coordinate('W'),'50.0','typing away from canvas does not navigate');
// Cross the 4D near plane, then return to the same measured viewpoint.
const visibleLabels=()=>page.locator('.eco-practice-labels span:not([hidden])').count();
const beforeClip=await visibleLabels();
for(let i=0;i<25;i++)await page.getByRole('button',{name:'− (Q)',exact:true}).click();
await page.waitForFunction(()=>document.querySelector('[data-coordinate="W"]').textContent==='-1200.0');
assert.equal(await visibleLabels(),0,'layers behind the 4D near plane are hidden');
for(let i=0;i<25;i++)await page.getByRole('button',{name:'+ (E)',exact:true}).click();
await page.waitForFunction(()=>document.querySelector('[data-coordinate="W"]').textContent==='50.0');
assert.equal(await visibleLabels(),beforeClip,'returning to the same W restores the projected layers');
await page.locator('#practice-object').selectOption('tesseract');
assert.equal(await page.locator('.eco-practice-labels span').count(),16);
assert.equal(await page.locator('#practice-transform').inputValue(),'rotate');
await page.locator('canvas').focus();await page.keyboard.down('e');
await page.waitForFunction(()=>Math.abs(Number(document.querySelector('#practice-angle').value))>1);await page.keyboard.up('e');
assert.equal(await coordinate('W'),'0.0','rotation does not translate the W camera');
for(const plane of ['1','2','0'])await page.locator('#practice-plane').selectOption(plane);
const tesseractBefore=await page.locator('canvas').screenshot();
await page.locator('#practice-angle').evaluate(n=>{n.value='45';n.dispatchEvent(new Event('input',{bubbles:true}))});
await page.waitForTimeout(100);
assert(!tesseractBefore.equals(await page.locator('canvas').screenshot()),'4D rotation changes the rendered tesseract');
await mkdir(artifacts,{recursive:true});await page.screenshot({path:artifacts+'tesseract-'+(process.env.PRACTICE_WEBGPU?'webgpu':'webgl')+'.png'});
await page.locator('#practice-transform').selectOption('scale');
await page.locator('canvas').focus();await page.keyboard.down('e');
await page.waitForFunction(()=>Number(document.querySelector('#practice-scale').value)>1.05);await page.keyboard.up('e');
await page.locator('#practice-auto').check();const autoAngle=await page.locator('#practice-angle').inputValue();
await page.waitForFunction(angle=>document.querySelector('#practice-angle').value!==angle,autoAngle);await page.locator('#practice-auto').uncheck();
await page.getByRole('button',{name:'Reset position',exact:true}).click();
assert.equal(await page.locator('#practice-angle').inputValue(),'0');assert.equal(await page.locator('#practice-scale').inputValue(),'1');assert.equal(await page.locator('#practice-auto').isChecked(),false);
await page.locator('#practice-object').selectOption('grid');await page.locator('#practice-transform').selectOption('translate');
await mkdir(artifacts,{recursive:true});await page.screenshot({path:artifacts+'desktop.png'});const image=PNG.sync.read(await page.locator('.eco-practice-view').screenshot());let colored=0;for(let i=0;i<image.data.length;i+=4){const [r,g,b]=image.data.slice(i,i+3);if(Math.max(r,g,b)>80&&Math.max(r,g,b)-Math.min(r,g,b)>35)colored++}assert(colored>1000,'gradient grid must render visible colored lines');
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);const gridBox=await page.locator('.eco-practice-view').boundingBox(),controlsBox=await page.locator('.eco-practice-controls').boundingBox();assert(gridBox.width>350&&gridBox.height>300,'practice grid stays visible on mobile');assert(controlsBox.y>=gridBox.y+gridBox.height-1,'mobile controls sit below the grid');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert(await page.getByRole('button',{name:'Reset position',exact:true}).isVisible());await page.screenshot({path:artifacts+'mobile.png'});
await page.locator('.eco-practice-controls [data-practice-exit]').click();await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.renderer==='canvas'&&document.querySelector('#network-status')?.textContent.includes('visible links'));assert.equal(await page.locator('#network-search').inputValue(),'Alpha');assert.equal(await page.locator('#link-width').inputValue(),'2');assert.equal(new URL(page.url()).searchParams.has('practice'),false);assert.equal(documents,1);assert.equal(snapshots,snapshotCount);assert(await page.evaluate(()=>document.fullscreenElement===originalHost));assert.deepEqual(errors,[]);console.log('PASS tesseract rotation/stretch/auto/reset, rendered rotation, grid translation/clipping, no reload, focus, mobile, fullscreen, preserved state');await page.evaluate(()=>root.unmount());
}finally{await browser.close()}
