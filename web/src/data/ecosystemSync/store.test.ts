import {IDBFactory} from 'fake-indexeddb'
import {beforeEach,it,expect,vi} from 'vitest'
import {queueChange,pendingChanges,exchangeChanges,readSyncState,receiveChanges,exportSyncStorage,restoreSyncStorage} from './store'
beforeEach(()=>vi.stubGlobal('indexedDB',new IDBFactory()))
it('restores offline history and outbox atomically and rejects cross-dataset backups',async()=>{
 const change=await queueChange('newsletter','issue',{title:'Roundup'},'deployment-a')
 const backup=await exportSyncStorage('deployment-a')
 vi.stubGlobal('indexedDB',new IDBFactory())
 await restoreSyncStorage('deployment-a',backup)
 expect(await pendingChanges('deployment-a')).toEqual([change])
 await expect(restoreSyncStorage('deployment-b',backup)).rejects.toThrow('Incompatible backup or dataset')
 await expect(restoreSyncStorage('deployment-a',{...backup,changes:[{...change,value:{title:'Conflicting'}}]})).rejects.toThrow()
 expect((await readSyncState('deployment-a'))['newsletter:issue'].value).toEqual({title:'Roundup'})
})
it('isolates deployments and exports pending browser edits with history',async()=>{
 const change=await queueChange('newsletter','issue',{title:'Roundup'},'deployment-a')
 expect(Object.keys(await readSyncState('deployment-b'))).toHaveLength(0)
 const backup=await exportSyncStorage('deployment-a')
 expect(backup.datasetId).toBe('deployment-a');expect(backup.indexedDbVersion).toBe(2)
 expect(backup.outbox).toEqual([change]);expect(backup.changes).toEqual([change])
})
it('upgrades IndexedDB version one without dropping history or pending edits',async()=>{
 const factory=indexedDB
 await new Promise<void>((resolve,reject)=>{
  const request=factory.open('orgportal-ecosystem-sync-v1',1)
  request.onupgradeneeded=()=>{
   const db=request.result;db.createObjectStore('changes',{keyPath:'id'});db.createObjectStore('outbox',{keyPath:'id'});db.createObjectStore('meta')
   const change={id:'old',entity:'funding',recordId:'round',replicaId:'browser',counter:1,deleted:false,value:{amount:100}}
   request.transaction!.objectStore('changes').put(change);request.transaction!.objectStore('outbox').put(change)
  }
  request.onsuccess=()=>{request.result.close();resolve()};request.onerror=()=>reject(request.error)
 })
 expect((await pendingChanges()).map(c=>c.id)).toEqual(['old'])
 expect((await readSyncState())['funding:round'].value).toEqual({amount:100})
})
it('keeps edits offline and acknowledges only after committed transport results',async()=>{
 const local=await queueChange('funding','swc-2026',{amount:600});expect(await pendingChanges()).toHaveLength(1)
 await expect(exchangeChanges(async()=>{throw Error('offline')})).rejects.toThrow('offline');expect(await pendingChanges()).toHaveLength(1)
 await exchangeChanges(async pending=>({changes:pending,acknowledged:pending.map(c=>c.id)}));expect(await pendingChanges()).toHaveLength(0);expect((await readSyncState())['funding:swc-2026']).toEqual(local)
})
it('merges a concurrent peer edit atomically and preserves deletion across stale replay',async()=>{
 const local=await queueChange('event','one',{title:'Original'})
 await receiveChanges([{...local,id:'peer-1',replicaId:'peer',counter:2,value:null,deleted:true}]);await receiveChanges([local]);expect((await readSyncState())['event:one'].deleted).toBe(true)
 const recreated=await queueChange('event','one',{title:'Recreated'});expect(recreated.counter).toBe(3)
})
it('rejects corrupted delivery without acknowledging pending edits',async()=>{
 const local=await queueChange('organization','one',{name:'Code Collective'})
 await expect(exchangeChanges(async()=>({changes:[{...local,counter:-1}],acknowledged:[local.id]}))).rejects.toThrow();expect(await pendingChanges()).toHaveLength(1)
 await expect(exchangeChanges(async()=>({changes:[],acknowledged:['not-sent']}))).rejects.toThrow('Invalid sync acknowledgement');expect(await pendingChanges()).toHaveLength(1)
})
