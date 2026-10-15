// Directory reconciliation and summaries are preparation work, not UI work.
export function prepareNetworkData(base,directory,records,history,signal) {
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return}
  const worker=new Worker(new URL('./network-data.worker.js',import.meta.url),{type:'module'})
  const cleanup=()=>{signal.removeEventListener('abort',cancel);worker.terminate()}
  const cancel=()=>{cleanup();reject(new DOMException('Aborted','AbortError'))}
  signal.addEventListener('abort',cancel,{once:true})
  worker.onmessage=({data})=>{cleanup();if(data.error)reject(new Error(data.error));else resolve(data)}
  worker.onerror=event=>{event.preventDefault();cleanup();reject(new Error(event.message))}
  worker.postMessage({base,directory,records,history})
 })
}

// Keep one immutable prepared dataset between dimensional views. Each renderer
// receives its own copy because layout and graph preparation mutate node data.
const preparedNetworks = new Map()
export async function loadSharedNetworkData(key, load, signal) {
 const now=Date.now()
 let entry=preparedNetworks.get(key)
 if(!entry || now-entry.createdAt>=5*60*1000){
  entry={createdAt:now,promise:Promise.resolve().then(load)}
  preparedNetworks.set(key,entry)
  // Bound retained datasets when moving among portal base paths.
  if(preparedNetworks.size>3)preparedNetworks.delete(preparedNetworks.keys().next().value)
  const current=entry
  void entry.promise.catch(()=>{if(preparedNetworks.get(key)===current)preparedNetworks.delete(key)})
 }
 const result=await entry.promise
 signal.throwIfAborted()
 return structuredClone(result)
}
