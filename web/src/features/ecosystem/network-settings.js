const STORAGE_KEY='orgportal.ecosystem.network.settings'
// URL state takes precedence over local preferences. Selection has its own org parameter.
export async function persistNetworkSettings(root,signal,graphType){
 if(!['2d','3d','4d'].includes(graphType))throw new Error('Unknown graph type')
 const storageKey=STORAGE_KEY+'.'+graphType
 const compressionKey=storageKey+'.compressed'
 const controls=[...root.querySelectorAll('.eco-network-controls input[id],.eco-network-controls select[id],.eco-network-controls input[name]')].filter(el=>el.id!=='network-search'&&el.id!=='neighbors'&&el.id!=='compress-network-settings')
 const key=el=>el.id||`${el.name}:${el.value}`
 const read=()=>{try{const value=JSON.parse(localStorage.getItem(storageKey));return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}}
 const params=new URL(location.href).searchParams
 let urlValues={}
 let hasURL=(params.has('s')||params.has('graph-settings'))&&(!params.has('graph-settings')||params.get('graph-settings')===graphType)
 try{if(hasURL)urlValues=params.has('s')?await decodeSettings(params.get('s')):Object.fromEntries([...params].filter(([k])=>k.startsWith('g.')).map(([k,v])=>[k.slice(2),JSON.parse(v)]))}catch{hasURL=false;root.querySelector('#network-share-status').textContent='Invalid settings URL; using saved preferences.'}
 if(signal.aborted)return
 const saved=hasURL?urlValues:read()
 const compact=root.querySelector('#compress-network-settings')
 compact.disabled=typeof CompressionStream!=='function'||typeof DecompressionStream!=='function';let savedCompression=false;try{savedCompression=localStorage.getItem(compressionKey)==='true'}catch{}
 compact.checked=(hasURL?params.has('s'):savedCompression)&&!compact.disabled
 let revision=0
 const updateLinks=()=>{for(const a of root.querySelectorAll('[data-graph-type]')){
  const next=new URL(a.href,location.origin),current=new URL(location.href)
  for(const k of [...next.searchParams.keys()])if(k==='s'||k==='graph-settings'||k.startsWith('g.'))next.searchParams.delete(k)
  if(a.dataset.graphType===graphType)for(const [k,v] of current.searchParams)if(k==='s'||k==='graph-settings'||k.startsWith('g.'))next.searchParams.set(k,v)
  a.href=next.href
 }}
 updateLinks()
 for(const el of controls){
  const value=saved[key(el)]
  if(el.type==='checkbox'){if(typeof value==='boolean')el.checked=value}
  else if(el.type==='color'){if(typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value))el.value=value}
  else if(el.tagName==='SELECT'){if([...el.options].some(option=>option.value===value))el.value=value}
  else if(typeof value==='number'&&Number.isFinite(value)&&(!el.hasAttribute('min')||value>=Number(el.min))&&(!el.hasAttribute('max')||value<=Number(el.max))){el.value=String(value)}
  const output=el.id&&root.querySelector(`#${el.id}-value`)
  if(output)output.textContent=el.id==='link-width'?Number(el.value).toFixed(2):el.step==='0.1'?Number(el.value).toFixed(1):el.value
 }
 const save=async()=>{
  const version=++revision
  const values={...saved}
  for(const el of controls){const value=el.type==='checkbox'?el.checked:(el.tagName==='SELECT'||el.type==='color')?el.value:el.valueAsNumber;if(el.validity.valid&&(typeof value!=='number'||Number.isFinite(value)))values[key(el)]=value}
  try{localStorage.setItem(storageKey,JSON.stringify(values));localStorage.setItem(compressionKey,String(compact.checked))}catch{/* Optional preference storage. */}
  try{
   const compressed=compact.checked?await encodeSettings(values):null
   if(signal.aborted||version!==revision)return
   const url=new URL(location.href)
   for(const key of [...url.searchParams.keys()])if(key==='s'||key==='graph-settings'||key.startsWith('g.'))url.searchParams.delete(key)
   url.searchParams.set('graph-settings',graphType)
   if(compressed)url.searchParams.set('s',compressed)
   else{for(const [key,value] of Object.entries(values))url.searchParams.set('g.'+key,JSON.stringify(value))}
   history.replaceState(history.state,'',url);updateLinks()
  }catch{root.querySelector('#network-share-status').textContent='Could not encode settings URL.'}
 }
 root.querySelector('.eco-network-controls').addEventListener('input',save,{signal})
 root.querySelector('.eco-network-controls').addEventListener('change',save,{signal})
 root.querySelector('#copy-network-url').addEventListener('click',async()=>{await save();try{await navigator.clipboard.writeText(location.href);root.querySelector('#network-share-status').textContent='Settings link copied.'}catch{root.querySelector('#network-share-status').textContent='Copy the URL from your address bar.'}},{signal})
 root.addEventListener('click',event=>{if(event.target.closest('#network-reset'))save()},{signal})
}

export async function encodeSettings(values){
 const stream=new Blob([JSON.stringify(values)]).stream().pipeThrough(new CompressionStream('gzip'))
 const bytes=new Uint8Array(await new Response(stream).arrayBuffer())
 return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')
}
export async function decodeSettings(value){
 if(value.length>16000)throw new Error('Settings URL too large')
 const bytes=Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))
 const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader()
 let length=0;const chunks=[]
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>64000)throw new Error('Settings URL too large');chunks.push(value)}}finally{await reader.cancel()}
 const result=JSON.parse(await new Blob(chunks).text())
 if(!result||typeof result!=='object'||Array.isArray(result))throw new Error('Invalid settings')
 return result
}
