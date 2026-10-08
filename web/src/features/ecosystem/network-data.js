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
