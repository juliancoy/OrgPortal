/** Snapshot-scoped, memory-bounded page buffer. Foreground work takes priority. */
export function createGraphPageBuffer(fetchPage,{maxBytes=32*1024*1024,maxEntries=64,concurrency=2,ttl=300000}={}){
 const cache=new Map(),jobs=new Map(),queue=[];let bytes=0,active=0,closed=false
 const key=params=>JSON.stringify(Object.entries(params).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)))
 const abortError=()=>new DOMException('Graph request cancelled','AbortError')
 function pump(){
  while(!closed&&active<concurrency&&queue.length){
   const job=queue.shift();if(!job.clients.size){jobs.delete(job.key);continue}active++;job.started=true
   void Promise.resolve().then(()=>fetchPage(job.params,job.controller.signal)).then(page=>{
    if(job.params.version&&page.version!==job.params.version)throw Error('Evidence snapshot changed. Reload this view.')
    const value=structuredClone(page),size=new TextEncoder().encode(JSON.stringify(value)).byteLength
    if(!closed&&size<=maxBytes){const id=key({...job.params,version:page.version});const prior=cache.get(id);if(prior){bytes-=prior.size;cache.delete(id)}cache.set(id,{value,size,time:Date.now()});bytes+=size;while(bytes>maxBytes||cache.size>maxEntries){const oldest=cache.keys().next().value;bytes-=cache.get(oldest).size;cache.delete(oldest)}}
    for(const client of job.clients)client.resolve(structuredClone(page))
   }).catch(error=>{for(const client of job.clients)client.reject(error)}).finally(()=>{for(const client of job.clients)client.cleanup();if(jobs.get(job.key)===job)jobs.delete(job.key);active--;pump()})
  }
 }
 function load(params,{signal,background=false}={}){
  if(closed||signal?.aborted)return Promise.reject(abortError())
  const id=key(params),hit=params.version&&cache.get(id)
  if(hit&&Date.now()-hit.time<ttl){cache.delete(id);cache.set(id,hit);return Promise.resolve(structuredClone(hit.value))}
  if(hit){bytes-=hit.size;cache.delete(id)}
  let job=jobs.get(id)
  if(job?.controller.signal.aborted)job=null
  if(!job){if(queue.length>=32)return Promise.reject(Error('Graph request buffer is full. Please retry.'));job={key:id,params:{...params},controller:new AbortController(),clients:new Set(),started:false};jobs.set(id,job);background?queue.push(job):queue.unshift(job)}
  else if(!background&&!job.started){queue.splice(queue.indexOf(job),1);queue.unshift(job)}
  return new Promise((resolve,reject)=>{
   const client={resolve,reject,cleanup:()=>signal?.removeEventListener('abort',cancel)}
   const cancel=()=>{job.clients.delete(client);client.cleanup();reject(abortError());if(!job.clients.size){job.controller.abort();if(!job.started){const index=queue.indexOf(job);if(index>=0)queue.splice(index,1);jobs.delete(id)}}}
   job.clients.add(client);signal?.addEventListener('abort',cancel,{once:true});pump()
  })
 }
 return {load,stats:()=>({bytes,entries:cache.size,active,queued:queue.length}),dispose(){closed=true;for(const job of jobs.values()){job.controller.abort();for(const client of job.clients){client.reject(abortError());client.cleanup()}}jobs.clear();queue.length=0;cache.clear();bytes=0}}
}
