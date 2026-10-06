import {mergeChanges,nextCounter,validateChange,type EcosystemChange,type EcosystemEntity,type EcosystemState} from './protocol'
export const SYNC_INDEXEDDB_VERSION = 2
const name='orgportal-ecosystem-sync-v1'
function storageName(dataset?:string){return dataset ? `orgportal-newsletters:${dataset}` : name}
function open(dataset?:string):Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open(storageName(dataset),SYNC_INDEXEDDB_VERSION);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('changes')){request.result.createObjectStore('changes',{keyPath:'id'});request.result.createObjectStore('outbox',{keyPath:'id'});request.result.createObjectStore('meta')}request.transaction!.objectStore('meta').put(SYNC_INDEXEDDB_VERSION,'schemaVersion')};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Sync storage blocked'))})}
async function transaction<T>(mode:IDBTransactionMode,action:(tx:IDBTransaction,finish:(result:T)=>void)=>void,dataset?:string):Promise<T>{const db=await open(dataset);try{return await new Promise<T>((resolve,reject)=>{const tx=db.transaction(['changes','outbox','meta'],mode);let value:T;tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error || new Error('Sync storage transaction aborted'));try{action(tx,result=>{value=result})}catch(error){tx.abort();reject(error)}})}finally{db.close()}}
export async function readSyncState(dataset?:string):Promise<EcosystemState>{return transaction<EcosystemState>('readonly',(tx,finish)=>{const request=tx.objectStore('changes').getAll();request.onsuccess=()=>finish(mergeChanges({},request.result))},dataset)}
export async function pendingChanges(dataset?:string):Promise<EcosystemChange[]>{return transaction('readonly',(tx,finish)=>{const request=tx.objectStore('outbox').getAll();request.onsuccess=()=>finish(request.result)},dataset)}
export async function queueChange(entity:EcosystemEntity,recordId:string,value:Record<string,unknown>|null,dataset?:string):Promise<EcosystemChange>{
 return transaction('readwrite',(tx,finish)=>{
  const changes=tx.objectStore('changes').getAll(),meta=tx.objectStore('meta'),node=meta.get('replicaId')
  node.onsuccess=()=>{
   try{const replicaId=node.result || crypto.randomUUID(),state=mergeChanges({},changes.result),change=validateChange({id:crypto.randomUUID(),entity,recordId,replicaId,counter:nextCounter(state),deleted:value===null,value});meta.put(replicaId,'replicaId');tx.objectStore('changes').add(change);tx.objectStore('outbox').add(change);finish(change)}catch{tx.abort()}
  }
 },dataset)
}
export async function receiveChanges(changes:unknown[],acknowledged:string[]=[],dataset?:string):Promise<void>{
 const validated=changes.map(validateChange)
 return transaction('readwrite',(tx,finish)=>{
  const request=tx.objectStore('changes').getAll();request.onsuccess=()=>{
   try{mergeChanges({},[...request.result,...validated]);for(const change of validated)tx.objectStore('changes').put(change);for(const id of acknowledged)tx.objectStore('outbox').delete(id);finish(undefined)}catch{tx.abort()}
  }
 },dataset)
}
export type SyncTransport=(pending:EcosystemChange[])=>Promise<{changes:unknown[];acknowledged:string[]}>
const active=new Map<string,Promise<void>>()
export function exchangeChanges(transport:SyncTransport,dataset?:string):Promise<void>{
 const key=storageName(dataset),running=active.get(key)
 if(running)return running
 const task=(async()=>{const pending=await pendingChanges(dataset),reply=await transport(pending);const sent=new Set(pending.map(c=>c.id));if(reply.acknowledged.some(id=>!sent.has(id)))throw new Error('Invalid sync acknowledgement');await receiveChanges(reply.changes,reply.acknowledged,dataset)})().finally(()=>{active.delete(key)})
 active.set(key,task)
 return task
}
export type SyncBackup={datasetId:string;indexedDbVersion:number;replicaId:string|null;changes:EcosystemChange[];outbox:EcosystemChange[]}
export async function exportSyncStorage(dataset:string):Promise<SyncBackup>{
 return transaction<SyncBackup>('readonly',(tx,finish)=>{
  const changes=tx.objectStore('changes').getAll(),outbox=tx.objectStore('outbox').getAll(),replica=tx.objectStore('meta').get('replicaId')
  replica.onsuccess=()=>finish({datasetId:dataset,indexedDbVersion:SYNC_INDEXEDDB_VERSION,replicaId:replica.result || null,changes:changes.result,outbox:outbox.result})
 },dataset)
}
export async function restoreSyncStorage(dataset:string,input:SyncBackup):Promise<void>{
 if(input.datasetId!==dataset || input.indexedDbVersion!==SYNC_INDEXEDDB_VERSION || !Array.isArray(input.changes) || !Array.isArray(input.outbox) || input.changes.length>10000 || input.outbox.length>10000)throw Error('Incompatible backup or dataset')
 const changes=input.changes.map(validateChange),outbox=input.outbox.map(validateChange)
 mergeChanges({},[...changes,...outbox])
 const ids=new Set(changes.map(change=>change.id))
 if(outbox.some(change=>!ids.has(change.id)))throw Error('Backup outbox is missing its history')
 return transaction('readwrite',(tx,finish)=>{
  const existing=tx.objectStore('changes').getAll()
  existing.onsuccess=()=>{
   try{mergeChanges({},[...existing.result,...changes]);for(const change of changes)tx.objectStore('changes').put(change);for(const change of outbox)tx.objectStore('outbox').put(change);finish(undefined)}catch{tx.abort()}
  }
 },dataset)
}
