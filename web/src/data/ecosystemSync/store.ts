import {mergeChanges,nextCounter,validateChange,type EcosystemChange,type EcosystemEntity} from './protocol'
const name='orgportal-ecosystem-sync-v1'
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>{request.result.createObjectStore('changes',{keyPath:'id'});request.result.createObjectStore('outbox',{keyPath:'id'});request.result.createObjectStore('meta')};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Sync storage blocked'))})}
async function transaction<T>(mode:IDBTransactionMode,action:(tx:IDBTransaction,finish:(result:T)=>void)=>void):Promise<T>{const db=await open();try{return await new Promise<T>((resolve,reject)=>{const tx=db.transaction(['changes','outbox','meta'],mode);let value:T;tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error || new Error('Sync storage transaction aborted'));try{action(tx,result=>{value=result})}catch(error){tx.abort();reject(error)}})}finally{db.close()}}
export async function readSyncState(){return transaction('readonly',(tx,finish)=>{const request=tx.objectStore('changes').getAll();request.onsuccess=()=>finish(mergeChanges({},request.result))})}
export async function pendingChanges():Promise<EcosystemChange[]>{return transaction('readonly',(tx,finish)=>{const request=tx.objectStore('outbox').getAll();request.onsuccess=()=>finish(request.result)})}
export async function queueChange(entity:EcosystemEntity,recordId:string,value:Record<string,unknown>|null):Promise<EcosystemChange>{
 return transaction('readwrite',(tx,finish)=>{
  const changes=tx.objectStore('changes').getAll(),meta=tx.objectStore('meta'),node=meta.get('replicaId')
  node.onsuccess=()=>{
   try{const replicaId=node.result || crypto.randomUUID(),state=mergeChanges({},changes.result),change=validateChange({id:crypto.randomUUID(),entity,recordId,replicaId,counter:nextCounter(state),deleted:value===null,value});meta.put(replicaId,'replicaId');tx.objectStore('changes').add(change);tx.objectStore('outbox').add(change);finish(change)}catch{tx.abort()}
  }
 })
}
export async function receiveChanges(changes:unknown[],acknowledged:string[]=[]):Promise<void>{
 const validated=changes.map(validateChange)
 return transaction('readwrite',(tx,finish)=>{
  const request=tx.objectStore('changes').getAll();request.onsuccess=()=>{
   try{mergeChanges({},[...request.result,...validated]);for(const change of validated)tx.objectStore('changes').put(change);for(const id of acknowledged)tx.objectStore('outbox').delete(id);finish(undefined)}catch{tx.abort()}
  }
 })
}
export type SyncTransport=(pending:EcosystemChange[])=>Promise<{changes:unknown[];acknowledged:string[]}>
let active:Promise<void>|null=null
export function exchangeChanges(transport:SyncTransport):Promise<void>{
 if(active)return active
 active=(async()=>{const pending=await pendingChanges(),reply=await transport(pending);const sent=new Set(pending.map(c=>c.id));if(reply.acknowledged.some(id=>!sent.has(id)))throw new Error('Invalid sync acknowledgement');await receiveChanges(reply.changes,reply.acknowledged)})().finally(()=>{active=null})
 return active
}
