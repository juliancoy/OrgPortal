import {chromium} from '@playwright/test'
import assert from 'node:assert/strict'
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader']})
try{
 const page=await browser.newPage({ignoreHTTPSErrors:true}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 if(process.env.FORCE_WEBGL)await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined}))
 await page.route('**/__smoothing_check',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}))
 await page.goto((process.env.MAP_ORIGIN||'https://localhost:8443')+'/__smoothing_check')
 const result=await page.evaluate(async()=>{
  document.body.innerHTML='<canvas style="width:800px;height:600px"></canvas>'
  const {createNetworkGPU3D}=await import('/src/features/ecosystem/webgpu-3d-renderer.js'),{createNetworkLayout}=await import('/src/features/ecosystem/network-layout.js')
  const nodes=Array.from({length:160},(_,i)=>({id:String(i),category:'company',renderRadius:4})),edges=nodes.slice(1).map((n,i)=>({id:'e'+i,source:String(i),target:n.id,kind:'transfer',amount:100,currency:'USD'}))
  let arrivals=0
  const layout=createNetworkLayout(nodes,edges,{dimensions:3,dither:1},true,()=>arrivals++)
  const renderer=await createNetworkGPU3D(document.querySelector('canvas'),message=>{throw Error(message)},()=>{})
  renderer.resize(800,600);renderer.fit(nodes)
  const visible=new Set(nodes.map(n=>n.id)),visibleEdges=new Set(edges.map(e=>e.id));let frames=0,activeFrames=0,partialFrames=0,previous=performance.now(),intervals=[]
  await new Promise(resolve=>{const end=performance.now()+4000;function frame(now){
   const updated=layout.consume(1) // A low adaptive budget must not split a 3D snapshot.
   if(updated.size){activeFrames++;if(updated.size!==nodes.length)partialFrames++}
   renderer.update(nodes,edges,visible,visibleEdges,null,{company:0x55aa88},()=>0x777777,frames?updated:null);renderer.render()
   intervals.push(now-previous);previous=now;frames++
   if(now<end)requestAnimationFrame(frame);else resolve()
  }requestAnimationFrame(frame)})
  layout.motion(false)
  await new Promise(resolve=>setTimeout(resolve,100))
  // Drain the final transition even after simulation pauses.
  await new Promise(resolve=>{function drain(){layout.consume(1);if(layout.pending())requestAnimationFrame(drain);else resolve()}drain()})
  const frozen=nodes.map(n=>[n.x,n.y,n.z]);await new Promise(resolve=>setTimeout(resolve,100));layout.consume(1)
  const stable=nodes.every((n,i)=>n.x===frozen[i][0]&&n.y===frozen[i][1]&&n.z===frozen[i][2])
  const result={backend:renderer.backend,frames,activeFrames,partialFrames,arrivals,stable,finite:nodes.every(n=>[n.x,n.y,n.z].every(Number.isFinite)),medianFrameMs:intervals.sort((a,b)=>a-b)[Math.floor(intervals.length/2)]}
  layout.stop();renderer.dispose();return result
 })
 assert.deepEqual(errors,[]);assert(result.finite);assert(result.stable);assert.equal(result.partialFrames,0);assert(result.arrivals>5);assert(result.activeFrames>5)
 console.log('PASS synchronized 3D frames, live worker, renderer, pause and cleanup',JSON.stringify(result))
}finally{await browser.close()}
