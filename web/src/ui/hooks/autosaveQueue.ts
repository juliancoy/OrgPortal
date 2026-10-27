export type AutosaveState={status:'saved'|'pending'|'saving'|'error';error?:string}
/** Serialize snapshots so a slow older response cannot overwrite a newer edit. */
export function createAutosaveQueue<T>(initial:T,save:(value:T,previous:T)=>Promise<void>,notify:(state:AutosaveState)=>void,delay=600){
 const snapshot=(value:T)=>({value:structuredClone(value),key:JSON.stringify(value)})
 let acknowledged=snapshot(initial),latest=acknowledged,timer:ReturnType<typeof setTimeout>|undefined,running:Promise<void>|null=null,failed=false,active=true,state:AutosaveState={status:'saved'}
 const publish=(next:AutosaveState)=>{state=next;if(active)notify(next)}
 async function flush():Promise<boolean>{
  clearTimeout(timer)
  if(running){await running;return failed?false:flush()}
  if(latest.key===acknowledged.key){publish({status:'saved'});return true}
  const sent=latest
  running=(async()=>{
   publish({status:'saving'})
   try{await save(sent.value,acknowledged.value);acknowledged=sent;failed=false;publish({status:latest.key===acknowledged.key?'saved':'pending'})}
   catch(error){failed=sent.key===latest.key;publish(failed?{status:'error',error:error instanceof Error?error.message:'Could not save. Please retry.'}:{status:'pending'})}
  })()
  await running;running=null
  return failed?false:latest.key===acknowledged.key?true:flush()
 }
 return {
  update(value:T){const next=snapshot(value);if(next.key===latest.key)return;latest=next;failed=false;clearTimeout(timer);if(!running&&latest.key===acknowledged.key)publish({status:'saved'});else{publish({status:running?'saving':'pending'});timer=setTimeout(()=>void flush(),delay)}},
  flush,
  retry(){failed=false;return flush()},
  state:()=>state,
  isSaved:(value:T)=>JSON.stringify(value)===acknowledged.key,
  dispose(){active=false;clearTimeout(timer);if(!failed)void flush()},
 }
}
