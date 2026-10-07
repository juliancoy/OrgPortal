import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const origin=process.env.MAP_ORIGIN||'http://127.0.0.1:5193'
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_BINARY||'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader']})
const ready=async page=>{try{await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('visible links'))}catch(e){console.log('not ready',await page.locator('#network-status').textContent());throw e}}
const pause=page=>page.locator('#live-physics').evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change'))})
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[]
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Failed to load resource'))console.log('console',m.text())})
 await page.addInitScript(()=>{
  window.gpuErrors=[]
  const request=GPUAdapter.prototype.requestDevice
  GPUAdapter.prototype.requestDevice=async function(...args){const device=await request.apply(this,args);device.addEventListener('uncapturederror',e=>window.gpuErrors.push(e.error.message));return device}
 })
 await page.route('**/api/org/api/network/**',r=>r.fulfill({status:503,body:'Saved evidence'}))
 await page.goto(origin+'/ecosystem/network/webgpu');await ready(page);await page.waitForFunction(()=>document.querySelector('#network-source')?.textContent.includes('refresh unavailable'));await pause(page)
 assert.equal(await page.locator('canvas[data-renderer=webgpu]').count(),1)
 assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>/\/three(?:_|\.|\/)/.test(r.name))),false,'native page must not load Three.js')
 const position=()=>page.locator('#network-labels button:not([hidden])').first().evaluate(b=>({x:parseFloat(b.style.left),y:parseFloat(b.style.top)}))
 const first=await position();await page.locator('#zoom-in').click()
 await page.waitForFunction(before=>{const b=document.querySelector('#network-labels button:not([hidden])');return b&&(parseFloat(b.style.left)!==before.x||parseFloat(b.style.top)!==before.y)},first)
 assert.notDeepEqual(await position(),first,'zoom changes projection')
 await page.locator('#network-fit').click();await page.waitForTimeout(100)
 const label=page.locator('#network-labels button:not([hidden])').first(),name=await label.textContent()
 await label.dispatchEvent('pointerenter');await page.locator('#network-detail .eco-preview-totals').waitFor()
 await label.click();await page.locator('[data-unpin-node]').waitFor();assert.ok(new URL(page.url()).searchParams.get('org'))
 await page.reload();await ready(page);await page.locator('[data-unpin-node]').waitFor();await pause(page)
 await page.locator('[data-unpin-node]').click();assert.equal(new URL(page.url()).searchParams.has('org'),false)
 await page.locator('[data-panel=controls]').click()
 await page.locator('#network-search').fill(name);assert.ok(await page.locator('#network-results button').count()>0)
 await page.locator('#zoom-sparse').check();await page.locator('#visibility-factor').fill('16');await page.waitForFunction(()=>Number(document.querySelector('#network-status').textContent.split(' ')[0])<140)
 const sparse=Number((await page.locator('#network-status').textContent()).split(' ')[0]);assert.ok(sparse<140)
 await page.locator('#network-reset').click();await pause(page);await ready(page)
 await page.locator('[data-panel=controls]').click()
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
 const canvas=page.locator('canvas[data-renderer=webgpu]'),box=await canvas.boundingBox(),panLabel=page.locator('#network-labels button:not([hidden])').first(),panName=await panLabel.textContent(),before=await panLabel.evaluate(b=>({x:parseFloat(b.style.left),y:parseFloat(b.style.top)}))
 await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await page.mouse.move(box.x+70,box.y+50);await page.mouse.up();await page.waitForTimeout(100)
 await page.waitForFunction(({name,before})=>{const b=[...document.querySelectorAll('#network-labels button')].find(b=>b.textContent===name);return b&&Math.abs(parseFloat(b.style.left)-before.x-60)<1&&Math.abs(parseFloat(b.style.top)-before.y-40)<1},{name:panName,before})
 // Clicking actual canvas artwork pins a node, independent of the DOM label.
 const button=page.locator('#network-labels button:not([hidden])').first(),point=await button.evaluate(b=>({x:parseFloat(b.style.left),y:parseFloat(b.style.top)}))
 await page.mouse.click(box.x+point.x,box.y+point.y);await page.locator('[data-unpin-node]').waitFor()
 await page.screenshot({path:process.env.GPU_SCREENSHOT||'/tmp/network-webgpu-verified.png'})
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.gpuErrors),[])
 // Verify actual GPU pixels: pie orientation, HSL colors, transparent background and link rasterization.
 const pixels=await page.evaluate(async()=>{
  const c=document.createElement('canvas');document.body.append(c)
  const request=GPUAdapter.prototype.requestDevice;let device
  GPUAdapter.prototype.requestDevice=async function(...args){device=await request.apply(this,args);return device}
  const configure=GPUCanvasContext.prototype.configure
  GPUCanvasContext.prototype.configure=function(options){return configure.call(this,{...options,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC})}
  const {createNetworkGPU}=await import('/src/features/ecosystem/webgpu-renderer.js')
  const r=await createNetworkGPU(c,message=>window.gpuErrors.push(message));r.resize(128,128)
  const node={id:'pie',x:64,y:64,renderRadius:30,category:'company',financialPie:{slices:[{startAngle:-Math.PI/2,endAngle:Math.PI/2,color:'hsl(0, 100%, 50%)'},{startAngle:Math.PI/2,endAngle:Math.PI*1.5,color:'hsl(120, 100%, 50%)'}]}}
  const edge={id:'edge',source:{x:4,y:10,renderRadius:2},target:{x:124,y:10,renderRadius:2},curveOffset:0,quantityWidth:6,relationship:'funding'}
  r.update([node],[edge],new Set(['pie']),new Set(['edge']),null,{company:0x0000ff},()=>0x00ff00);r.render({x:0,y:0,w:128,h:128})
  const texture=c.getContext('webgpu').getCurrentTexture(),buffer=device.createBuffer({size:128*128*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),encoder=device.createCommandEncoder()
  encoder.copyTextureToBuffer({texture},{buffer,bytesPerRow:512},{width:128,height:128});device.queue.submit([encoder.finish()]);await buffer.mapAsync(GPUMapMode.READ)
  const bytes=new Uint8Array(buffer.getMappedRange()),sample=(x,y)=>[...bytes.slice((y*128+x)*4,(y*128+x)*4+4)],bgra=navigator.gpu.getPreferredCanvasFormat()==='bgra8unorm'
  const rgb=(x,y)=>{const v=sample(x,y);return bgra?[v[2],v[1],v[0],v[3]]:v}
  const result={right:rgb(80,64),left:rgb(48,64),background:rgb(0,127),edge:rgb(64,10)}
  buffer.unmap();buffer.destroy();r.dispose();c.remove();GPUAdapter.prototype.requestDevice=request;GPUCanvasContext.prototype.configure=configure;return result
 })
 assert.deepEqual(pixels.right,[255,0,0,255]);assert.deepEqual(pixels.left,[0,255,0,255]);assert.equal(pixels.background[3],0);assert.ok(pixels.edge[1]>150&&pixels.edge[3]>150)
 console.log('Native WebGPU pixels, pies, links, picking, zoom, pan, sparse reveal, search and URL restoration verified')
 await page.close()
 const reduced=await browser.newPage({reducedMotion:'reduce'});await reduced.route('**/api/org/api/network/**',r=>r.fulfill({status:503,body:'Saved evidence'}));await reduced.goto(origin+'/ecosystem/network/webgpu');await ready(reduced);assert.equal(await reduced.locator('#live-physics').isChecked(),false);await reduced.close()
 for(const unavailable of ['missing','no-adapter']){
  const p=await browser.newPage();await p.addInitScript(mode=>{if(mode==='missing')Object.defineProperty(navigator,'gpu',{value:undefined});else navigator.gpu.requestAdapter=async()=>null},unavailable)
  await p.goto(origin+'/ecosystem/network/webgpu');await p.waitForFunction(()=>/WebGPU requires|No WebGPU adapter/.test(document.querySelector('#network-status')?.textContent||''));assert.ok(await p.getByRole('link',{name:'Graph',exact:true}).isVisible());await p.close()
 }
 console.log('Reduced motion and unsupported-browser paths verified')
}finally{await browser.close()}
