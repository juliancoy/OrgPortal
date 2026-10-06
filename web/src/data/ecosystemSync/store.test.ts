import {IDBFactory} from 'fake-indexeddb'
import {beforeEach,it,expect,vi} from 'vitest'
import {queueChange,pendingChanges,exchangeChanges,readSyncState,receiveChanges} from './store'
beforeEach(()=>vi.stubGlobal('indexedDB',new IDBFactory()))
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
