import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_BINARY||'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader']})
try{
 const page=await browser.newPage({viewport:{width:1200,height:900},reducedMotion:'no-preference'})
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.error(m.text())})
 await page.route('**/src/main.tsx',r=>r.abort())
 const base={organizations:Array.from({length:180},(_,i)=>({id:'n'+i,name:'Organization '+i,category:'company'})),relationships:Array.from({length:179},(_,i)=>({id:'r'+i,source:'n'+i,target:'n'+(i+1),relationship:'funding',kind:'transfer',currency:'USD',amount:100})),financing:[]}
 const empty={organizations:[],relationships:[],financing:[]}
 await page.route(/\/(ecosystem-data|api\/org\/api\/network)\//,r=>{const path=new URL(r.request().url()).pathname;return r.fulfill({json:path.includes('/orgs/public')?[]:path.includes('/relationships/public')?{records:[],nextRecordOffset:null}:path.includes('network-default-positions')?{organizations:{}}:path.endsWith('ecosystem-portal.json')?base:empty})})
 await page.goto(process.env.MAP_ORIGIN||'http://127.0.0.1:5202')
 await page.setContent('<main id="fixture" class="portal-ecosystem"></main>')
 const results=[]
 for(const type of ['canvas','webgpu','webgpu3d','webgpu4d']){
  await page.evaluate(async type=>{
   window.cleanup?.();const root=document.querySelector('#fixture')
   await import('/src/features/ecosystem/network.css')
   root.innerHTML=(await import('/src/features/ecosystem/markup.html?raw')).default
   const host=root.querySelector('#network-canvas');host.style.cssText='width:800px;height:600px;min-height:600px;position:relative'
   if(type==='webgpu4d')root.querySelector('.eco-network-controls').insertAdjacentHTML('afterbegin','<output id="life-w-position"></output>'+['xw','yw','zw'].map(v=>`<input id="life-${v}" value="0"><output id="life-${v}-value"></output>`).join('')+'<input id="life-perspective" value="0.35"><output id="life-perspective-value"></output><input id="life-radius" value="300"><input id="life-friction" value="0.85"><input id="life-seed" value="1">')
   history.replaceState(null,'','/ecosystem/network');localStorage.clear()
   const {mountEcosystemNetworkGPU}=await import('/src/features/ecosystem/network-webgpu.js')
   window.cleanup=mountEcosystemNetworkGPU(root,{dataUrl:'/ecosystem-data/ecosystem-portal.json',historyUrl:'/ecosystem-data/ecosystem-relationships.json',apiPrefix:'/api/org/api/network',portalPath:x=>x,renderer:type})
  },type)
  await page.waitForFunction(()=>/\d+\.\d+ FPS/.test(document.querySelector('.eco-network-fps')?.textContent),{timeout:30000}).catch(async error=>{console.error(JSON.stringify({type,errors,status:await page.locator('#network-status').textContent(),hud:await page.locator('.eco-network-fps').textContent()}));throw error})
  await page.waitForFunction(()=>Number.parseFloat(document.querySelector('.eco-network-fps')?.textContent)>=10,{timeout:15000})
  await page.waitForTimeout(1500)
  // Shader recompilation during adaptation can briefly interrupt an FPS sample.
  await page.waitForFunction(()=>Number.parseFloat(document.querySelector('.eco-network-fps')?.textContent)>=10,{timeout:15000})
  const result=await page.evaluate(()=>{const el=document.querySelector('.eco-network-fps'),hud=el.getBoundingClientRect(),host=document.querySelector('#network-canvas').getBoundingClientRect();return {text:el.textContent,left:hud.left-host.left,top:hud.top-host.top,backend:document.querySelector('canvas').dataset.backend,labels:[...document.querySelectorAll('#network-labels button')].filter(b=>!b.hidden).length}})
  assert.match(result.text,/FPS · \d+\/180 nodes\/frame/)
  assert.equal(result.left,8);assert.equal(result.top,8)
  assert(Number.parseFloat(result.text)>=10,`${type} below target: ${result.text}`)
  results.push({type,...result});console.log(JSON.stringify({type,...result}))
  await page.evaluate(()=>{
   const target=document.querySelector('#minimum-fps')
   if(target.value!=='10')throw Error('Default FPS target changed')
   target.value='30';target.dispatchEvent(new Event('input',{bubbles:true}))
   if(document.querySelector('#minimum-fps-value').textContent!=='30'||new URL(location.href).searchParams.get('g.minimum-fps')!=='30')throw Error('FPS setting did not apply and serialize')
   document.querySelector('#network-reset').click()
   if(target.value!=='10'||document.querySelector('#minimum-fps-value').textContent!=='10')throw Error('Reset did not restore the FPS target')
  })
 }
 await page.evaluate(()=>window.cleanup?.())
 // A camera change arriving during a GPU frame must still paint its latest view.
 const queued=await page.evaluate(async()=>{
  const request=GPUAdapter.prototype.requestDevice,views=[],lost=[];let paints=0,renderer
  GPUAdapter.prototype.requestDevice=async function(...args){const device=await request.apply(this,args),write=device.queue.writeBuffer.bind(device.queue);device.queue.writeBuffer=(buffer,offset,data,...rest)=>{if(data.byteLength===16)views.push(Array.from(data));return write(buffer,offset,data,...rest)};return device}
  try{
   const {createNetworkGPU}=await import('/src/features/ecosystem/webgpu-renderer.js'),canvas=document.createElement('canvas');document.body.append(canvas)
   renderer=await createNetworkGPU(canvas,message=>lost.push(message),()=>paints++)
   renderer.resize(100,100)
   const nodes=[{id:'one',x:25,y:25,renderRadius:10,category:'company'},{id:'two',x:60,y:60,renderRadius:10,category:'company'}]
   const edges=[{id:'link',source:nodes[0],target:nodes[1],relationship:'funding'}]
   renderer.update(nodes,edges,new Set(['one','two']),new Set(['link']),null,{company:0x357db7},()=>0x269c4a)
   renderer.render({x:0,y:0,w:100,h:100})
   nodes[0].x=30;renderer.update(nodes,edges,new Set(['one','two']),new Set(['link']),null,{company:0x357db7},()=>0x269c4a,new Set(['one']))
   renderer.render({x:22,y:33,w:444,h:555})
   for(let i=0;i<100&&paints<2;i++)await new Promise(r=>setTimeout(r,20))
   return {paints,lastView:views.at(-1),lost}
  }finally{renderer?.dispose();GPUAdapter.prototype.requestDevice=request}
 })
 assert(queued.paints>=2);assert.deepEqual(queued.lastView,[22,33,444,555]);assert.deepEqual(queued.lost,[])
 assert.deepEqual(errors,[])
 console.log(JSON.stringify(results,null,2))
}finally{await browser.close()}
