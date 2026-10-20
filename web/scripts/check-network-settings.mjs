import {chromium} from 'playwright'
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
try{
 const page=await browser.newPage()
 await page.route('**/src/main.tsx',route=>route.abort())
 await page.goto(process.env.MAP_ORIGIN||'http://127.0.0.1:5201')
 await page.setContent('<main id="fixture"></main>')
 const result=await page.evaluate(async()=>{
  const {persistNetworkSettings}=await import('/src/features/ecosystem/network-settings.js')
  const root=document.querySelector('#fixture');let abort
  async function mount(type,query=''){
   abort?.abort();abort=new AbortController()
   history.replaceState(null,'','/ecosystem/network'+(type==='2d'?'':'/'+type)+query)
   root.innerHTML='<div class="eco-network-controls"><input id="minimum-fps" type="range" min="1" max="120" step="1" value="10"><input id="attraction" type="range" min="0" max="20" step="0.1" value="1"><input id="compress-network-settings" type="checkbox"><button id="copy-network-url">Copy</button><p id="network-share-status"></p></div>'+['2d','3d','4d'].map(t=>`<a data-graph-type="${t}" href="/ecosystem/network/${t}?panel=visualization">${t}</a>`).join('')
   await persistNetworkSettings(root,abort.signal,type)
  }
  const input=()=>root.querySelector('#attraction'),compact=()=>root.querySelector('#compress-network-settings')
  const urls={},minimum=()=>root.querySelector('#minimum-fps')
  for(const [i,type] of ['2d','3d','4d'].entries()){
   await mount(type)
   if(input().value!=='1')throw Error('Settings leaked into '+type)
   minimum().value=String(15+i*5);input().value=String(i+2);compact().checked=type==='3d'
   input().dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,100))
   urls[type]=location.search
   for(const link of root.querySelectorAll('[data-graph-type]'))if(link.dataset.graphType!==type){const params=new URL(link.href).searchParams;if(params.has('s')||params.has('graph-settings')||[...params.keys()].some(k=>k.startsWith('g.')))throw Error('Settings carried to another type')}
  }
  for(const [i,type] of ['2d','3d','4d'].entries()){
   await mount(type)
   if(Number(input().value)!==i+2||compact().checked!==(type==='3d'))throw Error('Independent preferences failed for '+type)
   if(Number(minimum().value)!==15+i*5)throw Error('FPS target did not persist for '+type)
   await mount(type,urls[type])
   if(Number(input().value)!==i+2||Number(minimum().value)!==15+i*5)throw Error('Share URL reload failed for '+type)
  }
  await mount('4d',urls['3d']);if(input().value!=='4')throw Error('Foreign graph URL applied')
  return {independentSettings:true,independentCompression:true,graphLinks:true,shareURLs:true,minimumFPS:true}
 })
 console.log(JSON.stringify(result))
}finally{await browser.close()}
