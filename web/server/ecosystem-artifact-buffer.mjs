// Only versioned public artifacts are reusable. The manifest always stays fresh.
export function createArtifactBuffer(readText,{maxBytes=64*1024*1024,maxEntries=128}={}){
 const cache=new Map(),pending=new Map();let bytes=0
 return async key=>{
  if(!key.includes('/'))return JSON.parse(await readText(key))
  if(cache.has(key)){const entry=cache.get(key);cache.delete(key);cache.set(key,entry);return entry.value}
  if(pending.has(key))return pending.get(key)
  const request=(async()=>{const text=await readText(key),value=JSON.parse(text),size=new TextEncoder().encode(text).byteLength*3
   if(size<=maxBytes){cache.set(key,{value,size});bytes+=size;while(bytes>maxBytes||cache.size>maxEntries){const first=cache.keys().next().value;bytes-=cache.get(first).size;cache.delete(first)}}return value
  })();pending.set(key,request);try{return await request}finally{pending.delete(key)}
 }
}
